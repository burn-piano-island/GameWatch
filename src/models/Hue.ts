export interface Metadata {
    name: string;
}

export interface Service {
    rtype: string;
    rid: string;
}

export interface Position {
    x: number;
    y: number;
    z: number;
}

export interface ServiceLocation {
    service: Service;
    positions: Position[];
    position: Position;
}

export interface Locations {
    service_locations: ServiceLocation[];
}

export interface Member {
    index: number;
    service: Service;
}

export interface Channel {
    channel_id: number;
    position: Position;
    members: Member[];
}

export interface LightService {
    rtype: string;
    rid: string;
}

export interface Node {
    rtype: string;
    rid: string;
}

export interface StreamProxy {
    mode: string;
    node: Node;
}

export interface EndpointAreaListResponse {
    data: EntertainmentArea[];
}

export interface EntertainmentArea {
    configuration_type: string;
    id: string;
    id_v1: string;
    metadata: Metadata;
    type: string;
    locations: Locations;
    channels: Channel[];
    light_services: LightService[];
    stream_proxy: StreamProxy;
    status: string;
    name: string;
}

export interface DiscoveredBridge {
    internalipaddress: string;
    id: string;
    port: number;
}

export interface BridgeConfig {
    name: string;
    datastoreversion: string;
    swversion: string;
    apiversion: string;
    mac: string;
    bridgeid: string;
    factorynew: boolean;
    replacesbridgeid: string;
    modelid: string;
    starterkitid: string;
}

export interface Bridge {
    ip: string,
    config: BridgeConfig;
}
