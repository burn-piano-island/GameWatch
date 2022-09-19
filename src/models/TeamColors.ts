export interface Color {
    name: string;
    hex: string;
}

export interface Era {
    year: number;
    colors: Color[];
}

export interface TeamColorResponse {
    name: string;
    eras: Era[];
    league: string;
    _link: string;
}
