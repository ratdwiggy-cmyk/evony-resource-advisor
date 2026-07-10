import {resourceTiles} from "../data/tiles";

import type {March} from "../types/Gathering";


type Props={

march:March;

onChange:(march:March)=>void;

}


function MarchInput({
march,
onChange
}:Props){


return (

<div className="march-card">


<h3>
March {march.id}
</h3>


<div>

<label>

<input

type="checkbox"

checked={march.active}

onChange={
e=>
onChange({

...march,

active:e.target.checked

})
}

/>

 Using this march

</label>


</div>



<div>

<label>
Tile Level
</label>


<select

value={march.tileLevel}

onChange={
e=>
onChange({

...march,

tileLevel:
Number(e.target.value)

})
}

>

{
resourceTiles.map(tile=>(

<option
key={tile.level}
value={tile.level}
>

Level {tile.level}
({tile.resources.toLocaleString()})

</option>

))
}


</select>

</div>



<div>

<label>
Gathering Speed / Hour
</label>


<input

type="number"

value={march.gatheringRate}

onChange={
e=>
onChange({

...march,

gatheringRate:
Number(e.target.value)

})
}

/>


</div>


</div>

)

}


export default MarchInput;