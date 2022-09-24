import Color from 'color';
import { dtls } from 'node-dtls-client';
import { HueConstants } from '../constants';
import { addChannel } from '../utils';

export interface Creds {
    username: string;
    clientkey: string;
}

export interface ColorChannel {
    channelId: number;
    color: Color;
}

export class Scene {
    public channels: Dict<Color>
    private header: Buffer;
    constructor(header: Buffer) {
        this.channels = {};
        this.header = header;
    }

    setChannelColor(channelId: string, color: string | Color | undefined) {
        if(typeof color === "string") {
            color = Color(color);
        }
        this.channels[channelId] = color;
    }

    render() {
        let scene = this.header;
        for(const channelId in this.channels) {
            scene = addChannel(scene, channelId, this.channels[channelId]?.hex())
        }
        return scene;
    }

}

export interface Dict<T> {[id: string]: T | undefined}

export interface CreateSocketResponse {
    error?: any;
    socket?: dtls.Socket;
}