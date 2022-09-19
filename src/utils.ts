import Sharp from "sharp";
import asciify from "asciify-image";
import { contains } from "underscore";
import { NHLConstants } from "./constants";
import { API } from "./service/API";

// TODO - document functions and add tests

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const addChannel = (buffer: Buffer, channelId: string, color: string) => {
    const colorArray = convertHexRGBTo16BitArray(color);
    return Buffer.concat([buffer, Buffer.from([parseInt(channelId), ...colorArray])]);
};

export const convertHexRGBTo16BitArray = (s:string) => {
    if(!s.length || s.length < 6) {
        return [0x00, 0x00, 0x00, 0x00, 0x00];
    }
    if(s[0] == '#') {
        s = s.split('#')[1];
    }
    const vals: number[] = [];
    const hexArray = s.split(/(?=(?:..)*$)/);
    hexArray.forEach(val => {
        const _16bit = parseInt(val, 16);
        vals.push(_16bit);
        vals.push(_16bit);
    });
    return vals;
    
}

export const isOver = (gameState: string) => {
    return contains(NHLConstants.gameEndStates, gameState);
}

export const isInProgress = (gameState: string) => {
    return contains(NHLConstants.gameProgressStates, gameState);
}

/**
 * Parses string of game time like "12:34" into percentage of period ELAPSED
 * "20:00" - 0%,
 * "10:00" - 50%
 * "5:00" - 75%
 * @param time - game clock string
 */
export const parsePeriodTimeElapsed = (time: string) => {
    const timeRegex = Array.from(time.matchAll(/(\d+):(\d+)/g))?.[0];
    const minutes = parseInt(timeRegex[1]);
    const seconds = parseInt(timeRegex[2]);
    const secondsRemaining = minutes * 60 + seconds;
    const totalSeconds = 20 * 60;

    return 1 - (secondsRemaining / totalSeconds);
    
}

export const printTeamLogos = async (teamIds: string[]) => {
    // const baseImage = await Sharp().png().toBuffer();
    const composites: Buffer[] = [];
    for(let i = 0; i < teamIds.length; i++) {
        const image = await API.NHL.Teams.GetTeamLogo(teamIds[i]);
        const sharp = await Sharp(image).resize(500,400).png().toBuffer();
        composites.push(sharp);
    }
    const sharp = await Sharp({
        create: {
            background: { r: 0, g: 0, b: 0, alpha: 0 },
            height: 500,
            channels: 4,
            width: 1200,
        },
    })
    .composite(composites.map((composite, idx) => {
        return {
            input: composites[idx],
            left: (idx * 600), // 0 for first image, 500 for second,
            top: 0
        }
    })).png().toBuffer();
    const ascii = await asciify(sharp, {
        fit: "box",
        height: 30,
        width: 60
    });
    console.log(ascii)
}