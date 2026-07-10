import { useState } from "react";

import "./App.css";

import Header from "./components/Header";
import ResourceCard from "./components/ResourceCard";
import ResourceInput from "./components/ResourceInput";
import ResourceResults from "./components/ResourceResults";
import MarchInput from "./components/MarchInput";
import GatheringResults from "./components/GatheringResults";

import type { PlayerProfile } from "./types/PlayerProfile";
import type { Resource } from "./types/Resource";
import type { March, GatheringSetup } from "./types/Gathering";

import {
    calculate,
    calculateGathering
} from "./utils/calculator";



function App(){


const [profile,setProfile]=useState<PlayerProfile>({

    keepLevel:35,

    vipLevel:15,

    gatheringMarches:6

});




const [ore,setOre]=useState<Resource>({

    current:600000000,

    goal:20000000000,

    cityProduction:600000

});





const [gathering,setGathering]=useState<GatheringSetup>({

    generalBonus:40,

    generalGearBonus:10,

    subordinateCityBonus:54,


    marches:[

        {
            id:1,
            active:true,
            tileLevel:18,
            gatheringRate:3200000
        },

        {
            id:2,
            active:true,
            tileLevel:16,
            gatheringRate:2000000
        },

        {
            id:3,
            active:false,
            tileLevel:16,
            gatheringRate:1000000
        },

        {
            id:4,
            active:false,
            tileLevel:16,
            gatheringRate:1000000
        },

        {
            id:5,
            active:false,
            tileLevel:16,
            gatheringRate:1000000
        },

        {
            id:6,
            active:false,
            tileLevel:16,
            gatheringRate:1000000
        }

    ]

});





// FIRST calculate gathering

const gatheringResults =
calculateGathering(gathering);



// THEN calculate resource forecast

const oreResults =
calculate(
    ore,
    gatheringResults.totalHourly
);






function updateMarch(updated:March){


setGathering({

    ...gathering,

    marches:

    gathering.marches.map(
        march=>

        march.id===updated.id
        ?
        updated
        :
        march
    )

});


}






return (

<div className="container">


<Header />



<ResourceCard title="Account Profile">


<ResourceInput

label="Keep Level"

value={profile.keepLevel}

onChange={(value)=>

setProfile({

...profile,

keepLevel:value

})

}

/>



<ResourceInput

label="VIP Level"

value={profile.vipLevel}

onChange={(value)=>

setProfile({

...profile,

vipLevel:value

})

}

/>



</ResourceCard>







<ResourceCard title="Ore Forecast">


<ResourceInput

label="Current Ore"

value={ore.current}

onChange={(value)=>

setOre({

...ore,

current:value

})

}

/>




<ResourceInput

label="Ore Goal"

value={ore.goal}

onChange={(value)=>

setOre({

...ore,

goal:value

})

}

/>




<ResourceInput

label="City Production Per Hour"

value={ore.cityProduction}

onChange={(value)=>

setOre({

...ore,

cityProduction:value

})

}

/>



<ResourceResults

needed={oreResults.needed}

hourly={oreResults.totalHourly}

hours={oreResults.hours}

days={oreResults.days}

/>



<div>

<p>
City Production:
{oreResults.cityHourly.toLocaleString()}
 /hr
</p>


<p>
Gathering Income:
{oreResults.gatheringHourly.toLocaleString()}
 /hr
</p>


<p>
Total Income:
{oreResults.totalHourly.toLocaleString()}
 /hr
</p>


</div>



</ResourceCard>









<ResourceCard title="Extra Materials Bonuses">


<ResourceInput

label="General Extra Materials Bonus %"

value={gathering.generalBonus}

onChange={(value)=>

setGathering({

...gathering,

generalBonus:value

})

}

/>





<ResourceInput

label="General Gear Extra Materials Bonus %"

value={gathering.generalGearBonus}

onChange={(value)=>

setGathering({

...gathering,

generalGearBonus:value

})

}

/>





<ResourceInput

label="Subordinate City Extra Materials Bonus %"

value={gathering.subordinateCityBonus}

onChange={(value)=>

setGathering({

...gathering,

subordinateCityBonus:value

})

}

/>



<p>

Total Extra Materials:

{gatheringResults.totalBonus}%

</p>


</ResourceCard>









<ResourceCard title="Gathering Marches">



{

gathering.marches.map(

march=>(

<MarchInput

key={march.id}

march={march}

onChange={updateMarch}

/>

)

)

}





<GatheringResults

results={gatheringResults}

/>



</ResourceCard>






</div>

);


}


export default App;