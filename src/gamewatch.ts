/**
 * This is a very VERY unstable work in progress.
 * There be dragons - please be gentle running this code.
 * 
 * TODOS
 * 1. Classify socket / streaming interactions with hub (WIP)
 * 2. Move *ALL* API calls to API service class (WIP)
 * 3. In-game tasks
 *    a. progress bars for game clock - DONE
 *    b. goal announcements - WIP
 *    c. intermissions / game states
 *    d. progress bars for penalties
 *    e. progress bar for pregame countdown
 */


import ColorWrapper from "color";
import inquirer from 'inquirer';
import fetch from "node-fetch";
import Chalk from "chalk"
import { MultiProgressBars } from 'multi-progress-bars';
import { schedule } from "node-cron";
import { dtls } from "node-dtls-client";
import { Game } from "./models/NHLSchedule";
import { Color, TeamColorResponse } from "./models/TeamColors";
import {
    DEFAULT_GOAL_LIGHT,
    Environment,
    EVERY_TEN_SECONDS,
    GAME_CLOCK_PROGRESS_BAR,
    NHL_COLORS_ENDPOINT,
} from "./constants";
import { isInProgress, isOver, parsePeriodTimeElapsed, printTeamLogos, sleep } from "./utils";
import { API } from './service/API';
import { HueEntertainmentClient } from "./HueEntertainmentClient";
import { EntertainmentArea } from "./models/Hue";
import { Dict } from "./models/Models";

//#region selection prompts
const pickGame = async (): Promise<Game> => {
    const games = await API.NHL.Schedule.GetSchedule(Environment.DEBUG ? '2022-09-27' : undefined);
    const answers = await inquirer.prompt([
        {
            type: "list",
            name: "game",
            message: "Which game to watch?",
            choices: games.map((game) => {
                return {
                    name: `${game.teams.away.team.name} @ ${game.teams.home.team.name}`,
                    value: game
                };
            }),
        },
    ]);
    return answers.game;
}

const pickTeamIds = async(game: Game): Promise<string[]> => {
    const { gamePk } = game;
    const gameFeedResponse = await API.NHL.Games.GetGameById(gamePk);
    const { teams } = gameFeedResponse.gameData;
    const answers = await inquirer.prompt([
        {
            type: "list",
            name: "teams",
            message: "Which Teams to watch?",
            choices: [
                {
                    name: `${teams.home.teamName}`,
                    value: [teams.home.id]
                },
                {
                    name: `${teams.away.teamName}`,
                    value: [teams.away.id]
                },
                {
                    name: `Both`,
                    value: [teams.home.id, teams.away.id]
                }
            ]
        },
    ]);
    return answers.teams;

}

const pickColors = async(teams: string[]) => {
    const allTeams = await API.NHL.Teams.GetTeams();
    const selectedTeams = allTeams.filter(team => teams.indexOf(team.id) >= 0);
    const lookup:Dict<Color> = {};
    for(let i = 0; i < selectedTeams.length; i++) {
        const team = selectedTeams[i];
        const { name: teamName } = team;
        const colorResponse = await (await fetch(`${NHL_COLORS_ENDPOINT}/${teamName}`)).json() as TeamColorResponse;
        const { eras } = colorResponse;
        await printTeamLogos([`${team.id}`]);
        const answer = await inquirer.prompt([
            {
                type: "list",
                name: "color",
                message: `Select ${teamName} Colors`,
                choices: eras.map(era => {
                    return [
                        DEFAULT_GOAL_LIGHT,
                        new inquirer.Separator(`---${era.year} Era---`),
                        ...era.colors.map(color => {
                            return {
                                name: Chalk.hex(color.hex)(`${color.name}: ${color.hex}`),
                                value: color
                            }
                        })]
                }).flat(),
            }
        ]);
        lookup[team.id] = answer.color;
    }
    return lookup;
}

//#endregion

const hueClient = new HueEntertainmentClient();
hueClient.auth().then(async() => {
    // select entertainment area
    const area = await hueClient.pickEntertainmentArea();
    // Select game to watch
    const game = await pickGame();
    // Select teams to watch
    const teams = await pickTeamIds(game);
    // Pick colors for each team
    const color_lookup = await pickColors(teams);
    // try to initialize dtls stream with hub
    const socket = await hueClient.initializeEndpointStream(area.id);
    if(socket) {
        // start checking goals, kill the task once the game is over
        const task = await StartGoalChecker(socket, area, game.gamePk,color_lookup, () => {
            task.stop();
        });
    }
});

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
const StartGoalChecker = async (socket: dtls.Socket, area: EntertainmentArea, gamePk: string, color_lookup: Dict<Color>, doneCallback: Function) => {
    
    // TEST goal light colors
    if(Environment.DEBUG) {
        const teamIds = Object.keys(color_lookup);
        const numChannels = area.channels.length;
        await printTeamLogos(teamIds);
        await goalFlash(
            socket,
            ColorWrapper(color_lookup[teamIds[0]].hex),
            numChannels,
            2000
        );
        if (teamIds?.[1]) {
            await goalFlash(
                socket,
                ColorWrapper(color_lookup[teamIds[1]].hex),
                numChannels,
                2000
            );
        }
    }

    let wasIntermission = false;
    let isOvertime = false;
    let isShootout = false;
    let lastGoalAt: Date = new Date();
    console.log('Game Starting!');
    const game = await API.NHL.Games.GetGameById(gamePk);
    const { teams } = game.gameData;
    const { away, home } = teams;

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
        console.log('checking game state - press CTRL+C to end');
        const feed = await API.NHL.Games.GetGameById(gamePk);
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
                    const color = ColorWrapper(color_lookup[goal.team?.id!].hex);
                    goalFlash(socket, color, area.channels.length, 5000);
                    
                });
            }

            // TODO - handle overtime
            console.log(`${currentPeriodTimeRemaining} remaining in the ${linescore.currentPeriodOrdinal} period.`);
        }
    })
}

// TODO - move into HueClient
/**
 * Flash hue lights for a goal by a particular team
 * @param socket Socket for streaming events
 * @param color  Color to flash lights
 * @param numberOfChannels  number of channels to add to stream buffer
 * @param duration milliseconds to flash lights
 */
const goalFlash = async(socket: dtls.Socket, color: ColorWrapper, numberOfChannels: number, duration: number) => {
    // channels = number of channels to show light on
    //constants
    const darken_amount=.08;
    const lighten_amount=.32;
    const targetFramerate = 50;
    const sleep_interval = 1000 / targetFramerate
    const loop = duration / sleep_interval;

    let scene = hueClient.createScene();
    for(i = 0; i < numberOfChannels; i++){
        scene.setChannelColor(`${i}`,color);
    }
    // track whether we're increasing or decreasing channel brightness
    let darkening = true;
    for (var i = 0; i < loop; i++) {
        socket.send(scene.render());
        await sleep(sleep_interval);
        //for each light in scene
        for(const channelId in scene.channels) {
            let color = scene.channels[channelId];
            let lightness = color.lightness();
            // if light is not off (lightness 0), darken it
            if((lightness < 5 && darkening) || (lightness > 48 && !darkening)){
                darkening = !darkening;
            }

            if(darkening) {
                //darkenby
                //https://github.com/Qix-/color/issues/53#issuecomment-487822576
                scene.setChannelColor(channelId, color.lightness(lightness - lightness * darken_amount))
            }
            else {
                //brightenBy
                scene.setChannelColor(channelId, color.lightness(lightness + (100 - lightness) * lighten_amount))
            }

        }
    }
}
