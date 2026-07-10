import { formatNumber } from "../utils/formatNumber";


type Props = {

    results:any;

};



function GatheringResults({results}:Props){


return (

<div className="results">


<h3>
Gathering Summary
</h3>



<p>
Active Marches:

<strong>
{" "}
{results.activeMarches}
</strong>

</p>



<p>
Total Extra Materials Bonus:

<strong>
{" "}
{results.totalBonus}%
</strong>

</p>




<p>
Effective Gathering Income:

<strong>
{" "}
{formatNumber(results.totalHourly)}
/hr
</strong>

</p>





{

results.marchResults.map(

(march:any)=>(


<div

className="march-result"

key={march.id}

>


<h4>
March {march.id}
</h4>



<p>

Tile Level:

<strong>
{" "}
{march.tileLevel}
</strong>

</p>



<p>

Tile Resources:

<strong>

{" "}
{formatNumber(march.tileAmount)}

</strong>

</p>




<p>

Gathering Speed:

<strong>

{" "}
{formatNumber(march.gatheringRate)}
/hr

</strong>

</p>





<p>

Clear Time:

<strong>

{" "}
{march.clearHours.toFixed(2)}
hours

</strong>

</p>






<p>

Base Resources:

<strong>

{" "}
{formatNumber(march.tileAmount)}

</strong>

</p>






<p>

Returned Resources:

<strong>

{" "}
{formatNumber(march.returnedResources)}

</strong>

</p>





<p>

Effective Income:

<strong>

{" "}
{formatNumber(march.effectiveHourlyIncome)}
/hr

</strong>

</p>



</div>


)

)


}



</div>

);


}



export default GatheringResults;