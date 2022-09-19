import inquirer from "inquirer";
import fetch from "node-fetch";
import Chalk from "chalk";
import { appendFile } from "fs";
import { MultiProgressBars } from "multi-progress-bars";
import {
    ENV_HUE_BRIDGE_IP,
    ENV_HUE_CLIENT_KEY,
    ENV_HUE_KEY,
    HueConstants,
    HUE_ACTION_STREAM_START,
    HUE_ACTION_STREAM_STOP,
    HUE_DEVICETYPE,
    Paths,
} from "./constants";
import { Bridge, EntertainmentArea as EntertainmentArea } from "./models/Hue";
import { Creds, Dict, Scene } from "./models/Models";
import { API } from "./service/API";
import { sleep } from "./utils";
import { dtls } from "node-dtls-client";

/**
 * Class for interacting with Hue Entertainment API and bridges
 * HEAVY WIP
 */
export class HueEntertainmentClient {
    private HUE_BRIDGE_IP = process.env[ENV_HUE_BRIDGE_IP] ?? "";
    private BRIDGE_NAME = "Hue Bridge";
    private HUE_CLIENTKEY = process.env[ENV_HUE_CLIENT_KEY] ?? "";
    private HUE_USERNAME = process.env[ENV_HUE_KEY] ?? '';
    private HUE_HEADERS: Dict<string> = {};
    private ENTERTAINMENT_AREA?: EntertainmentArea;
    private HUE_ENTERTAINMENT_AREA_ENDPOINT?: string;
    private BUFFER_HEADER?: Buffer;
    private SOCKET?: dtls.Socket;

    /**
     * Constructs a new instance of the Hue Client.
     * Used for auth / streaming / configuration of the hue entertainment areas.
     */
    constructor() {}

    private HUE_STREAM_BASE_OPTIONS = () =>{
        return {
            method: "PUT",
            url: this.HUE_ENTERTAINMENT_AREA_ENDPOINT,
            json: true,
            headers: this.HUE_HEADERS,
        };
    }
    
    /**
     * Authenticate with a hue bridge at `HUE_BRIDGE_IP`
     * If no bridge is saved in environment settings, discover bridges and let user pick which one to use.
     * Handles Bridge Sync button linking.
     */
    auth = async () => {
        // if no bridge IP set in env, find bridges
        if (!this.HUE_BRIDGE_IP) {
            // let user select bridge
            const bridges = await API.Hue.Discovery.FindBridges();
            // if no bridges, we have an issue
            if (!bridges.length) {
                throw new Error(
                    "No bridges found on network, please specify a bridge address with the environment variable this.HUE_BRIDGE_IP"
                );
            }
            // use first bridge if there's only one
            else if (bridges.length == 1) {
                console.log(
                    `Only one bridge found at ${bridges[0].ip} - ${bridges[0].config.name}`
                );
                this.HUE_BRIDGE_IP = bridges[0].ip;
                this.BRIDGE_NAME = bridges[0].config.name;
            }
            // pick the bridge
            else {
                const answer = await inquirer.prompt([
                    {
                        type: "list",
                        name: "bridge",
                        message: "Select Bridge",
                        choices: bridges.map((bridge) => {
                            return {
                                name: bridge.config.name,
                                value: bridge,
                            };
                        }),
                    },
                ]);
                const bridge = answer.bridge as Bridge;
                this.HUE_BRIDGE_IP = bridge.ip;
                this.BRIDGE_NAME = bridge.config.name;
            }
        }

        // no creds in env, need to auth
        if (!this.HUE_CLIENTKEY || !this.HUE_USERNAME) {
            const SYNC_WAIT_TIME = 90;
            const SYNC_SLEEP_AMOUNT_MS = 1000;
            //create sync progress bar
            const sync_iterator = new MultiProgressBars({
                anchor: "top",
                persist: false,
                border: true,
                initMessage: `Please press the sync button on ${this.BRIDGE_NAME}`,
            });
            sync_iterator.addTask(HueConstants.BRIDGE_SYNC_PROGRESS_BAR, {
                type: "percentage",
            });
            // loop for button press
            for (let i = 0; i < SYNC_WAIT_TIME; i++) {

                await sleep(SYNC_SLEEP_AMOUNT_MS);
                sync_iterator.updateTask(
                    HueConstants.BRIDGE_SYNC_PROGRESS_BAR,
                    {
                        percentage: i / SYNC_WAIT_TIME,
                    }
                );

                // check for button press
                const pressedResponse = await fetch(
                    Paths.Hue.HUE_BRIDGE_API_ENDPOINT(this.HUE_BRIDGE_IP),
                    {
                        method: "POST",
                        body: JSON.stringify({
                            devicetype: HUE_DEVICETYPE,
                            generateclientkey: true,
                        }),
                    }
                );
                // if the response was successful
                if (pressedResponse.status == 200) {
                    const pressedResult = (await pressedResponse.json()) as {
                        success?: Creds;
                        error?: {
                            address: string;
                            description: string;
                            type: number;
                        };
                    }[];
                    // if no error, button was pressed
                    if (!pressedResult?.[0]?.error) {
                        // update progress bar
                        sync_iterator.done(
                            HueConstants.BRIDGE_SYNC_PROGRESS_BAR,
                            {
                                message: "Button pressed!",
                                barTransformFn: Chalk.green
                            }
                        );
                        // force finish loop
                        i = SYNC_WAIT_TIME;

                        const creds = pressedResult[0].success;
                        if (creds) {
                            this.HUE_CLIENTKEY = creds.clientkey;
                            this.HUE_USERNAME = creds.username;
                            this.HUE_HEADERS["hue-application-key"] =
                                this.HUE_USERNAME;
                            // write all to config
                            await appendFile(
                                ".env",
                                `\nhueBridgeIP=${this.HUE_BRIDGE_IP}\nhueclientkey=${this.HUE_CLIENTKEY}\nhueapplicationkey=${this.HUE_USERNAME}`,
                                (err) => {
                                    if (err) {
                                        throw err;
                                    }
                                    Chalk.red(
                                        "Saved hue config values to .env file"
                                    );
                                }
                            );
                        }
                    }
                }
            }
        } else {
            this.HUE_HEADERS["hue-application-key"] = this.HUE_USERNAME;
        }
    };

    /**
     * Prompts user to pick which entertainment area on the bridge to use for light events.
     * @returns The user-selected Hue EntertainmentArea
     */
    pickEntertainmentArea = async () => {
        const endpointsList = await API.Hue.Bridge.ListEntertainmentAreas(
            this.HUE_BRIDGE_IP,
            this.HUE_HEADERS
        );
        const answer = await inquirer.prompt([
            {
                type: "list",
                name: "endpoint",
                message: "Which entertainment area?",
                choices: endpointsList.map((endpoint) => {
                    return {
                        name: endpoint.metadata.name,
                        value: endpoint,
                    };
                }),
            },
        ]);
        // this.ENTERTAINMENT_AREA = answer.endpoint as Entertainment_Area;
        // this.HUE_ENTERTAINMENT_AREA_ENDPOINT = Paths.Hue.HUE_ENTERTAINMENT_AREA_ENDPOINT(this.HUE_BRIDGE_IP, this.ENTERTAINMENT_AREA.id);
        const endpoint = answer.endpoint as EntertainmentArea;
        this.ENTERTAINMENT_AREA = endpoint;
        return endpoint;
    };

    /**
     * Initializes a Sync stream using a particular entertainment area.
     * @param id The ID of the entertainment area
     * @returns A socket to stream events to
     */
    initializeEndpointStream = async (id: string) => {
        const ENTERTAINMENT_AREA_ID = id;
        const HUE_ENTERTAINMENT_AREA_ENDPOINT =
            Paths.Hue.HUE_ENTERTAINMENT_AREA_ENDPOINT(
                this.HUE_BRIDGE_IP,
                ENTERTAINMENT_AREA_ID
            );
        
        const streamStartOptions = {
            ...this.HUE_STREAM_BASE_OPTIONS(),
            body: JSON.stringify(HUE_ACTION_STREAM_START),
        };

        let utf8Encode = new TextEncoder();

        this.BUFFER_HEADER = Buffer.from([
            ...Array.from(utf8Encode.encode("HueStream")),
            0x02,
            0x00, //version 2.0
            0x00, //sequence number - ignore
            0x00,
            0x00, //Reserved
            0x00, //color mode RGB
            0x00, //Reserved, write 0’s
            /////// LIGHT STUFF
            ...Array.from(utf8Encode.encode(ENTERTAINMENT_AREA_ID)), //entertainment configuration id
        ]);

        const response = await fetch(HUE_ENTERTAINMENT_AREA_ENDPOINT, streamStartOptions);
        if (response && response.status < 400) { 
            return this.createSocket();
        }
        else {
            console.error(response.statusText);
        }
        return undefined;
    }

    /**
     * Attempts to end the streaming events on the currently configured entertainment area
     * @returns void, when completed
     */
    endEndpointStream = async() => {
        const ENTERTAINMENT_AREA_ID = this.ENTERTAINMENT_AREA?.id;
        if(!ENTERTAINMENT_AREA_ID) {
            console.warn(Chalk.yellow("Attempted to close endpoint stream that doesn't exist"));
            return;
        }
        const HUE_ENTERTAINMENT_AREA_ENDPOINT =
            Paths.Hue.HUE_ENTERTAINMENT_AREA_ENDPOINT(
                this.HUE_BRIDGE_IP,
                ENTERTAINMENT_AREA_ID
            );
        const streamStopOptions = {
            ...this.HUE_STREAM_BASE_OPTIONS(),
            body: JSON.stringify(HUE_ACTION_STREAM_STOP),
        };
        const response = await fetch(HUE_ENTERTAINMENT_AREA_ENDPOINT, streamStopOptions);
       if(response.ok) {
        console.log(Chalk.green('Successfully closed stream'));
       }
       else {
       console.warn(Chalk.red('Failed to close stream'));
       }
    };

    /**
     * Creates a DTLS socket connection with the Hue Bridge
     * @returns the DTLS socket to stream events to the configured entertainment area
     */
    createSocket = async() => {
        let options: dtls.Options = {
            type: "udp4",
            address: this.HUE_BRIDGE_IP,
            port: 2100,
            psk: {},
            timeout: 3000,
        };
         // @ts-ignore - psk defined as string dictionary but this object needs to be a buffer
        options.psk[this.HUE_USERNAME] = Buffer.from(this.HUE_CLIENTKEY, "hex");
        let socket: dtls.Socket = dtls
            .createSocket(options)
            .on("connected", (e) => {
                console.log("Connected!", e);
                this.SOCKET = socket;
                // socket.send(test_buffer);
            })
            .on("error", (e) => {
                console.log("ERROR", e);
                // TODO - handle retry if DTLS handshake timed out
            })
            .on("message", (msg) => {
                console.log("MESSAGE", msg);
            })
            .on("close", async (e) => {
                console.log("CLOSE", e);
                this.endEndpointStream()
                // const response = await fetch(this.HUE_ENTERTAINMENT_AREA_ENDPOINT!, streamStopOptions)
                // if (!response.ok) console.error(response.statusText);
                // else console.log(response.body);
            });
            return socket;
    }

    /**
     * WIP / TODO - creates a 'Scene', a.k.a. Stream Buffer to send to the socket
     * Uses a preconfigured header, can be used to configure light effects per channel
     * @returns a new Scene object with the existing entertainment area details.
     */
    createScene = () => {
        if(!this.BUFFER_HEADER) {
            throw new Error("Error creating scene buffer");
        }
        return new Scene(this.BUFFER_HEADER);
    }
}
