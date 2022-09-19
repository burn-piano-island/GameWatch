import fetch from "node-fetch";
import { Paths } from "../constants";
import { Bridge, BridgeConfig, DiscoveredBridge, EndpointAreaListResponse, EntertainmentArea } from "../models/Hue";
import { Dict } from "../models/Models";
import { GameFeedResponse } from "../models/NHLGameFeed";
import { Game, ScheduleResponse } from "../models/NHLSchedule";
import { Team, TeamsResponse } from "../models/NHLTeams";

export async function get<T>(url: string, headers?: {[id: string]: string}): Promise<T> {
    const response = await fetch(url, { headers });
    const body = await response.json();
    return body;
}
export module API {
    export module NHL {
        export module Schedule {
            export const GetSchedule: (
                date?: string
            ) => Promise<Game[]> = async (date) => {
                const response = await get<ScheduleResponse>(
                    date
                        ? Paths.NHL.Get.ScheduleByDate(date)
                        : Paths.NHL.Get.Schedule
                );
                return response.dates.reduce(
                    (prev, curr) => prev.concat(curr.games),
                    [] as Game[]
                );
            };
            export const GetTeamSchedule: (
                teamId: string,
                start?: string,
                end?: string
            ) => Promise<Game[]> = async (id, start, end) => {
                const endpoint = start
                    ? Paths.NHL.Get.TeamScheduleByDate(id, start, end)
                    : Paths.NHL.Get.TeamSchedule(id);
                const response = await get<ScheduleResponse>(endpoint);
                return response.dates.reduce(
                    (prev, curr) => prev.concat(curr.games),
                    [] as Game[]
                );
            };
        }
        export module Teams {
            export const GetTeams: () => Promise<Team[]> = async () => {
                const response = await get<TeamsResponse>(Paths.NHL.Get.Teams);
                return response.teams;
            };

            export const GetTeamLogo: (id: string) => Promise<Buffer> = async (teamId: string) => {
                const response = await (await fetch(Paths.NHL.Get.TeamLogo(teamId))).arrayBuffer()
                return Buffer.from(response);
            }

            export const GetTeam: (
                id: string
            ) => Promise<Team | undefined> = async (id) => {
                const response = await get<TeamsResponse>(
                    Paths.NHL.Get.Team(id)
                );
                return response?.teams?.[0];
            };
        }
        export module Games {
            export const GetGameById: (
                id: string
            ) => Promise<GameFeedResponse> = async (id) => {
                const response = await get<GameFeedResponse>(
                    Paths.NHL.Get.GameFeed(id)
                );
                return response;
            };
        }
    }

    export module Hue {
        export module Discovery {
            export const FindBridges = async () => {
                const discoveredEndpoints = await get<DiscoveredBridge[]>(Paths.Hue.HUE_DISCOVERY_ENDPOINT);
                const bridges: Bridge[] = [];
                for(let i = 0; i < discoveredEndpoints.length; i++) {
                    const ip = discoveredEndpoints[i].internalipaddress;
                    const config = await get<BridgeConfig>(Paths.Hue.HUE_BRIDGE_CONFIG(ip))
                    bridges.push({
                        ip,
                        config
                    });
                }
                return bridges;
            }
        }
        export module Bridge {
            export const ListEntertainmentAreas = async(ip: string, headers: Dict<string>) => {
                return (await get<EndpointAreaListResponse>(Paths.Hue.HUE_ENTERTAINMENT_LIST_ENDPOINT(ip), headers)).data;
            }
            export const GetEntertainmentArea = async(ip: string, id: string, headers: Dict<string>) => {
                return await get<EntertainmentArea>(Paths.Hue.HUE_ENTERTAINMENT_AREA_ENDPOINT(ip, id), headers);
            }
        }
    }
}
