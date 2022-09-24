import { Color } from "./models/TeamColors";
import { MultiProgressBars } from "multi-progress-bars";
import { schedule } from "node-cron";
import { dtls } from "node-dtls-client";
import { Environment, GAME_CLOCK_PROGRESS_BAR, EVERY_TEN_SECONDS } from "./constants";
import { HueEntertainmentClient } from "./HueEntertainmentClient";
import { EntertainmentArea } from "./models/Hue";
import { Dict } from "./models/Models";
import { API } from "./service/API";
import { printTeamLogos, parsePeriodTimeElapsed, isOver, isInProgress } from "./utils";
import Chalk from 'chalk';
 /**
* Heavy work in progress - several unfinished / untested sections.
* Returns a scheduled task that checks and updates game status every 10 seconds
* May need to move inside HueClient for ease of use.
* Still under construction while we await the preseason for live testing.
* @param socket Socket to stream packets to
* @param area  Entertainment area to use for lighting effects (currently needed to determine channels)
* @param gamePk Game key
* @param color_lookup Dictionary of [teamId]: Color
* @returns a scheduled task that checks and updates game status every 10 seconds
*/
export const StartGoalChecker = async (hueClient: HueEntertainmentClient, socket: dtls.Socket, area: EntertainmentArea, gamePk: string, color_lookup: Dict<Color>, doneCallback: Function) => {
   const teamIds = Object.keys(color_lookup);
   const game = await API.NHL.Games.GetGameById(gamePk);
   const { teams } = game.gameData;
   const { away, home } = teams;

   const { channels } = area;
   const left_channels = channels.filter(chan => chan.position.x < 0);
   const right_channels = channels.filter(chan => chan.position.x > 0);

   const default_scene = hueClient.createScene();
   const home_color = color_lookup?.[home.id];
   const away_color = color_lookup?.[away.id];
   left_channels.forEach(chan => {
       default_scene.setChannelColor(`${chan.channel_id}`, away_color?.hex || home_color?.hex);
   });
   right_channels.forEach(chan => {
       default_scene.setChannelColor(`${chan.channel_id}`, home_color?.hex || away_color?.hex);
   });
   hueClient.setScene(default_scene);
   hueClient.start();
   // TEST goal light colors
   if(Environment.DEBUG) {
       const numChannels = channels.length;
       await printTeamLogos(teamIds);
       await hueClient.showGoal(
           color_lookup[teamIds[0]]?.hex,
           2000
       );
       if (teamIds?.[1]) {
           await hueClient.showGoal(
               color_lookup[teamIds[1]]?.hex,
               2000
           );
       }
   }

   let wasIntermission = false;
   let isOvertime = false;
   let isShootout = false;
   let lastGoalAt: Date = new Date();
   console.log('Game Starting!');


   const mpb = new MultiProgressBars({
       initMessage: `${away.teamName} @ ${home.teamName}`,
       anchor: "top",
       persist: true,
       border: true,
   });
   mpb.addTask(GAME_CLOCK_PROGRESS_BAR, { type: 'percentage', barTransformFn: Chalk.red, nameTransformFn: (name: string) => name, percentage: 0 });

   // Tasks for game checker
   // Setup colors per side of screen (channel, X value)
   // home team changes every period, starts on right (verify)
   // hook into scene / socket class so we can interrupt normal streaming with a new scene for a time period
   // penalty progress bar
   return schedule(EVERY_TEN_SECONDS, async () => {
       const feed = await API.NHL.Games.GetGameById(gamePk);
       // mpb.updateTask(GAME_CLOCK_PROGRESS_BAR, {percentage: progress+=.01});
       const { linescore } = feed.liveData;
       const { currentPeriodTimeRemaining } = linescore;
       const percentOfPeriodElapsed = parsePeriodTimeElapsed(currentPeriodTimeRemaining);
       const { inIntermission, intermissionTimeRemaining } = linescore.intermissionInfo;
       const gameState = feed?.gameData?.status?.codedGameState;
       const periodsElapsed = linescore.currentPeriod - 1;
       // update game clock progress bar
       mpb.updateTask(GAME_CLOCK_PROGRESS_BAR, {percentage: (periodsElapsed + percentOfPeriodElapsed) / 3  })
       //playoffs have multiple OT periods
       isOvertime = linescore.currentPeriod > 3;
       //only regular season has shootouts
       isShootout = linescore.currentPeriodOrdinal == 'SO';

       //if the game is over, shut it down
       if (isOver(gameState)) {
           // End the gamel
           mpb.done(GAME_CLOCK_PROGRESS_BAR, {
               barTransformFn: Chalk.yellow
           });
           // get winning team
           const {home, away } = linescore.teams;
           const winner = home.goals > away.goals ? home : away;
           const color = color_lookup?.[winner.team.id];
           if( color ) {
               await hueClient.showGoal(color.hex, 10000)
           }
           doneCallback();
       }
       // Only do shootout checks if we're in a shootout
       else if(isShootout) {
           //reuse lastGoalAt since it hasn't changed (or we wouldn't be in a shootout)
           const { teams } = linescore;
           const { plays } = feed.liveData;
           const shootoutPlayIds = plays.playsByPeriod[linescore.currentPeriod-1];
           const { startIndex } = shootoutPlayIds;
           const { allPlays } = plays;
           const allShootoutAttempts = allPlays.slice(startIndex).filter((play) => play.result.eventTypeId in ["SHOT", "GOAL"]);
           const newShootoutItems = allShootoutAttempts.filter(play =>  new Date(play.about.dateTime) > lastGoalAt);
           //if we have *new* shootout items
           if(newShootoutItems?.[0]) {
               //display shootout items one by one.
               newShootoutItems.forEach(async (attempt) => {
                   lastGoalAt = new Date(attempt.about?.dateTime ?? lastGoalAt);
                   console.log(attempt);
               });

           }
       }
       // don't check scores or updates if we're in intermission
       else if (inIntermission) {
           //if now intermission, but wasn't before
           if (!wasIntermission) {
               const { home, away } = linescore.teams;
               console.log(`End of the ${linescore.currentPeriodOrdinal} period.
               ${away.team.name}: ${away.goals} - ${home.team.name}: ${home.goals}`);
               wasIntermission = true;
               // TODO - setup progress bar for intermission
           }
           const mins = Math.floor(intermissionTimeRemaining / 60);
           const secs = intermissionTimeRemaining % 60;
           console.log(`${mins}:${secs} remaining in the ${linescore.currentPeriodOrdinal} intermission.`);
       }
       //otherwise do the thing
       else if (isInProgress(gameState)) {
           // if first update back from intermission
           if (wasIntermission) {
               console.log(`${linescore.currentPeriodOrdinal} period starting!`);
               wasIntermission = false;
               // TODO - cleanup progress bar for intermission
           }
           // check goals
           const { plays } = feed.liveData;
           const { allPlays, scoringPlays } = plays;

           // Get all goals from scoringPlays
           const allGoals = scoringPlays.map(play => {
               return allPlays[play];
           })
           // TODO - figure out how to handle disallowed goals (toronto vs montreal from 9/28 or 9/27 as an example)
           const newGoals = allGoals.filter(play =>  new Date(play.about.dateTime) > lastGoalAt);

           if (newGoals?.[0]) {
               lastGoalAt = new Date(newGoals?.[newGoals.length-1]?.about?.dateTime ?? lastGoalAt);
               newGoals.forEach(goal => {
                   //announce goal
                   // TODO - test GoalFlash / colors / etc
                   console.log(goal);
                   const { team } = goal;
                   if(team && color_lookup?.[team?.id]) {
                       const color = color_lookup[team!.id]?.hex;
                       hueClient.showGoal(color, 5000);
                   }
                   
               });
           }

           // TODO - handle overtime
           console.log(`${currentPeriodTimeRemaining} remaining in the ${linescore.currentPeriodOrdinal} period.`);
       }
   })
}
