import type {Resource} from "../types/Resource";
import type {GatheringSetup} from "../types/Gathering";

import {resourceTiles} from "../data/tiles";



// RESOURCE FORECAST

export function calculate(
    resource:Resource,
    gatheringHourly:number
){


const current =
Number(resource.current) || 0;


const goal =
Number(resource.goal) || 0;


const cityHourly =
Number(resource.cityProduction) || 0;


const totalHourly =
cityHourly + gatheringHourly;


const needed =
Math.max(
goal-current,
0
);



const hours =
totalHourly > 0
?
needed / totalHourly
:
0;



return {

needed,

cityHourly,

gatheringHourly,

totalHourly,

hours,

days:
hours / 24

};


}





// GATHERING CALCULATOR


export function calculateGathering(
setup:GatheringSetup
){


const totalBonus =

Number(setup.generalBonus || 0)

+

Number(setup.generalGearBonus || 0)

+

Number(setup.subordinateCityBonus || 0);



const bonusMultiplier =
1 +
(totalBonus / 100);




const marchResults =

setup.marches

.filter(
march=>march.active
)

.map(march=>{


const tile =

resourceTiles.find(
t=>
t.level===march.tileLevel
);



const tileAmount =
tile?.resources ?? 0;



const speed =
Number(march.gatheringRate) || 0;



const clearHours =

speed > 0

?

tileAmount / speed

:

0;



const returnedResources =

tileAmount *
bonusMultiplier;



const effectiveHourlyIncome =

clearHours > 0

?

returnedResources / clearHours

:

0;



return {


id:march.id,


tileLevel:march.tileLevel,


tileAmount,


gatheringRate:speed,


clearHours,


returnedResources,


effectiveHourlyIncome,


bonusPercent:totalBonus


};


});





const totalHourly =

marchResults.reduce(

(total,march)=>

total+
march.effectiveHourlyIncome,

0

);




return {


marchResults,


totalHourly,


activeMarches:
marchResults.length,


totalBonus


};


}