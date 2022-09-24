/**
 * This is a very VERY unstable work in progress.
 * There be dragons - please be gentle running this code.
 * 
 * TODOS
 * 
 * easy notes
 * add game start time to game picker
 * 
 * stupid notes
 * maybe think about using d3.js for light pattern math? sin wave / pulse / etc for pregame?
 * 
 * 1. Game details header / scoreboard UI
 *    a. Score
 *    b. team logos and abbreviations
 * 3. In-game tasks
 *    a. progress bars for game clock - DONE
 *    b. goal announcements - TESTING
 *    c. intermissions / game states- WIP
 *    d. pregame spinner
 *    e. progress bars for penalties
 *    f. progress bar for pregame countdown
 */

import inquirer from 'inquirer';
import Chalk from "chalk"
import { Game } from "./models/NHLSchedule";
import { Color } from "./models/TeamColors";
import { DEFAULT_GOAL_LIGHT } from "./constants";
import { askConfirmation, printTeamLogos } from "./utils";
import { API } from "./service/API";
import { HueEntertainmentClient } from "./HueEntertainmentClient";
import { Dict } from "./models/Models";
import { StartGoalChecker } from "./GoalChecker";

//#region selection prompts
const pickGame = async (): Promise<Game> => {
    const games = await API.NHL.Schedule.GetSchedule();
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
        const colorResponse = await API.NHL.Teams.GetTeamColors(teamName);
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
    let { socket, error} = await hueClient.initializeEndpointStream(area.id);

    if(error && !socket) {
        //handle dtls retry
        while(error) {
            const retry = await askConfirmation('There was an error communicating with the hub to start the Sync stream. Would you like to try again?');
            if(retry) {
               const response = await hueClient.initializeEndpointStream(area.id);
               error = response.error;
               if(!response.error) {
                    socket = response.socket;
               }
            }
        }
    }
    if(socket) {
        // start checking goals, kill the task once the game is over
        const task = await StartGoalChecker(hueClient, socket, area, game.gamePk,color_lookup, () => {
            task.stop();
            hueClient.stop();
        });
    }
});