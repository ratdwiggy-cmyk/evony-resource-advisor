export interface March {

    id:number;

    active:boolean;

    tileLevel:number;

    gatheringRate:number;

}



export interface GatheringSetup {

    marches:March[];

    generalBonus:number;

    generalGearBonus:number;

    subordinateCityBonus:number;

}