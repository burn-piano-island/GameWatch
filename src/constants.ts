import { Color } from "./models/TeamColors";
import * as dotenv from "dotenv";
import chalk from "chalk";
dotenv.config();

export module Environment {
    export const DEBUG = process.env['DEBUG']?.toLowerCase() == 'true';
}

export const ENV_HUE_KEY = "hueapplicationkey";
export const ENV_HUE_CLIENT_KEY = "hueclientkey";
export const ENV_HUE_BRIDGE_IP = "hueBridgeIP";

export const HUE_DEVICETYPE = "gamewatch#node";

export const NHL_API_ENDPOINT = "https://statsapi.web.nhl.com";
export const NHL_COLORS_ENDPOINT = 'https://api.teamhex.dev/leagues/nhl'
export const DEFAULT_GOAL_LIGHT: Color = {
    hex: chalk.red('#FF0000'),
    name: '(default) Goal Light Red'
};

export const GAME_CLOCK_PROGRESS_BAR = 'Game clock'

export const HUE_ACTION_STREAM_START = { action: "start" };
export const HUE_ACTION_STREAM_STOP = { action: "stop" };
export const GAME_CHECK_INTERVAL_CRON = `*/5 * * * * *`;

export module Paths {
    export module NHL {
        export const API_HOST_URL: string = `https://statsapi.web.nhl.com`;
        export const API_PART: string = 'api/v1';
        export const API_ENDPOINT = `${API_HOST_URL}/${API_PART}`;
        export const TeamLogo = (id: string) => `https://www-league.nhlstatic.com/images/logos/teams-current-primary-light/${id}.svg`;
        
        export module Get {
            export const Schedule: string = `${API_ENDPOINT}/schedule?expand=schedule.linescore,schedule.game.seriesSummary`;
            export const ScheduleByDate:(startDate: string, endDate?: string) => string = 
                (start, end) => `${Schedule}&startDate=${start}&endDate=${end || start}`;

            export const TeamSchedule: (id: string) => string =
                (id) => `${Schedule}&teamId=${id}`;

            export const TeamScheduleByDate :(team: string, startDate: string, endDate?: string) => string =
                (id, start, end) => `${Schedule}&teamId=${id}&startDate=${start}&endDate=${end || start}`;

            export const Teams: string = `${API_ENDPOINT}/teams`;
            export const Team:(id: string) => string = (id) => `${Paths.NHL.Get.Teams}/${id}`;

            export const GameFeed: (id: string) => string = (id) => `${API_ENDPOINT}/game/${id}/feed/live`;
            export const TeamLogo: (id: string) => string = (teamId) => `https://www-league.nhlstatic.com/images/logos/teams-current-primary-light/${teamId}.svg`;
        }
    }
    export module Hue {
        export const HUE_DISCOVERY_ENDPOINT = "https://discovery.meethue.com";
        export const HUE_BRIDGE_CONFIG = (HUE_BRIDGE_IP: string) => `https://${HUE_BRIDGE_IP}/api/v1/config`;
        export const HUE_BRIDGE_API_ENDPOINT = (HUE_BRIDGE_IP: string) => `https://${HUE_BRIDGE_IP}/api`;
        export const HUE_ENTERTAINMENT_LIST_ENDPOINT = (HUE_BRIDGE_IP: string) => `https://${HUE_BRIDGE_IP}/clip/v2/resource/entertainment_configuration`;
        export const HUE_ENTERTAINMENT_AREA_ENDPOINT = (HUE_BRIDGE_IP: string, ENTERTAINMENT_AREA_ID: string) =>`${HUE_ENTERTAINMENT_LIST_ENDPOINT(HUE_BRIDGE_IP)}/${ENTERTAINMENT_AREA_ID}`;
    }
}

export module HueConstants {
    export const BRIDGE_SYNC_PROGRESS_BAR = "Waiting for sync button press";
    export module Lights {
        export const OFF = [0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
    }
}

export module NHLConstants {
    export enum EventTypes {
        Goal = 'GOAL',
        Shot = 'SHOT'
    }
    export enum GameStates {
        FINAL = "7",
        ALMOST_FINAL = "6",
        GAME_OVER = "5",
        CRITICAL = "4",
        IN_PROGRESS = "3",
        PRE_GAME = "2",
        POSTPONED = "9",
        PREVIEW_TBD = "8",
        PREVIEW = "1"
    }
    
    export const gameEndStates: string[] = [
        GameStates.ALMOST_FINAL, // finalizing
        GameStates.FINAL,    // legit final
        GameStates.GAME_OVER // last period has ended
    ]
    
    export const gameProgressStates: string[] = [
        GameStates.IN_PROGRESS,
        GameStates.CRITICAL
    ]
}
