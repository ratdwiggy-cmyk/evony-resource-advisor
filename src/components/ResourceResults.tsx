import { formatNumber } from "../utils/formatNumber";

type Props = {

    needed:number;

    hourly:number;

    hours:number;

    days:number;

}

function ResourceResults({

needed,

hourly,

hours,

days

}:Props){

return(

<div className="results">

<h3>Forecast</h3>

<p>

Ore Needed

<strong>

{formatNumber(needed)}

</strong>

</p>

<p>

Hourly Income

<strong>

{formatNumber(hourly)}

</strong>

</p>

<p>

Hours Remaining

<strong>

{hours.toFixed(1)}

</strong>

</p>

<p>

Days Remaining

<strong>

{days.toFixed(1)}

</strong>

</p>

</div>

)

}

export default ResourceResults;