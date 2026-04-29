function generateTable() {
    const num = parseInt(document.getElementById("numGenerators").value);
    const container = document.getElementById("generatorTableContainer");
    let html = `<table>
        <tr>
            <th>Generator</th>
            <th>a (Quadratic, ₹/MW^2)</th>
            <th>b (Linear, ₹/MW)</th>
            <th>c (Fixed, ₹)</th>
            <th>Min Power (MW)</th>
            <th>Max Power (MW)</th>
        </tr>`;
    for (let i = 0; i < num; i++) {
        html += `<tr>
            <td>G${i + 1}</td>
            <td><input type="number" id="a${i}" step="0.01" placeholder="a${i}"></td>
            <td><input type="number" id="b${i}" step="1" placeholder="b${i}"></td>
            <td><input type="number" id="c${i}" step="1" placeholder="c${i}"></td>
            <td><input type="number" id="Pmin${i}" step="1" placeholder="Min MW"></td>
            <td><input type="number" id="Pmax${i}" step="1" placeholder="Max MW"></td>
            </tr>`;
    }
    html += `</table>`;
    container.innerHTML = html;
}
function autofillThreeGeneratorData() {
    const numGeneratorsInput = document.getElementById("numGenerators");
    numGeneratorsInput.value = 3;
    generateTable();
    const generatorData = [
        { a: 0.001562, b: 7.92,  c: 561, Pmin: 150, Pmax: 600 },
        { a: 0.00194,  b: 7.85,  c: 310, Pmin: 100, Pmax: 400 },
        { a: 0.00482,  b: 7.97,  c: 78,  Pmin: 50,  Pmax: 200 }
    ];
    generatorData.forEach((g, i) => {
        document.getElementById(`a${i}`).value = g.a;
        document.getElementById(`b${i}`).value = g.b;
        document.getElementById(`c${i}`).value = g.c;
        document.getElementById(`Pmin${i}`).value = g.Pmin;
        document.getElementById(`Pmax${i}`).value = g.Pmax;
    });
    // Set load demand to 850 MW
    document.getElementById("loadDemand").value = 850;
}
function runEconomicDispatch() {
    const num = parseInt(document.getElementById("numGenerators").value);
    const loadDemand = parseFloat(document.getElementById("loadDemand").value);
    if (isNaN(num) || num < 1 || isNaN(loadDemand) || loadDemand <= 0) {
        alert("Please enter valid number of generators and load demand.");
        return;
    }
    let generators = [];
    for (let i = 0; i < num; i++) {
        let a = parseFloat(document.getElementById(`a${i}`).value);
        let b = parseFloat(document.getElementById(`b${i}`).value);
        let c = parseFloat(document.getElementById(`c${i}`).value);
        let Pmin = parseFloat(document.getElementById(`Pmin${i}`).value);
        let Pmax = parseFloat(document.getElementById(`Pmax${i}`).value);
        if (isNaN(a) || isNaN(b) || isNaN(c) || isNaN(Pmin) || isNaN(Pmax)) {
            alert(`Invalid input for Generator ${i + 1}`);
            return;
        }
        generators.push({ id: i + 1, a, b, c, Pmin, Pmax, allocated: 0 });
    }
    // --------------------------
    // ✅ Demand feasibility check
    // --------------------------
    const sumPmin = generators.reduce((sum, g) => sum + g.Pmin, 0);
    const sumPmax = generators.reduce((sum, g) => sum + g.Pmax, 0);
    if (loadDemand < sumPmin) {
        alert(`⚠️ Demand (${loadDemand} MW) is less than the sum of minimum generation limits (${sumPmin} MW).`);
        return;
    }
    if (loadDemand > sumPmax) {
        alert(`⚠️ Demand (${loadDemand} MW) exceeds the total maximum capacity of generators (${sumPmax} MW).`);
        return;
    }
    let lambda = 0;
    const allLinear = generators.every(g => g.a === 0);
    // --------------------------
    // Case 1: All linear costs
    // --------------------------
    if (allLinear) {
        // Sort by b (incremental cost)
        generators.sort((g1, g2) => g1.b - g2.b);
        let remainingLoad = loadDemand;
        for (const g of generators) {
            if (remainingLoad <= 0) break;
            let power = Math.min(g.Pmax, Math.max(g.Pmin, remainingLoad));
            g.allocated = power;
            remainingLoad -= power;
        }
        // Lambda is b of the last generator that was used
        const lastUsed = generators.findLast(g => g.allocated > 0);
        lambda = lastUsed ? lastUsed.b : 0;
    }
    // --------------------------
    // Case 2: Quadratic or mixed
    // --------------------------
    else {
        const tolerance = 0.01;
        let lambdaLow = Math.min(...generators.map(g => g.a > 0 ? 2 * g.a * g.Pmin + g.b : Infinity));
        let lambdaHigh = Math.max(...generators.map(g => g.a > 0 ? 2 * g.a * g.Pmax + g.b : -Infinity));
        let iterations = 0;
        const maxIterations = 1000;
        let totalGen = 0;
        let P = 0;
        while (iterations < maxIterations) {
            lambda = (lambdaLow + lambdaHigh) / 2;
            let totalGen = 0;
            for (let g of generators) {
                let P;
                if (g.a === 0) {
                    // Linear generator — if lambda > b, use Pmax else Pmin (acts as step cost)
                    P = lambda > g.b ? g.Pmax : g.Pmin;
                } else {
                    P = (lambda - g.b) / (2 * g.a);
                }
                // Clamp within min/max
                if (P < g.Pmin) P = g.Pmin;
                if (P > g.Pmax) P = g.Pmax;
                g.allocated = P;
                totalGen += P;
            }
            const mismatch = totalGen - loadDemand;
            if (Math.abs(mismatch) < tolerance) break;
            if (mismatch > 0) lambdaHigh = lambda;
            else lambdaLow = lambda;
            iterations++;
            // Debug logs
            console.log(`Iteration: ${iterations}, Lambda: ${lambda.toFixed(4)}, TotalGen: ${totalGen.toFixed(2)}, Mismatch: ${mismatch.toFixed(4)}`);
        }
        if (iterations >= maxIterations) {
            console.warn("⚠️ Lambda Iteration reached maximum iterations without converging.");
        }
    }
    generators.sort((g1, g2) => g1.id - g2.id);
    // --------------------------
    // Display Results
    // --------------------------
    let totalCost = 0;
    let resultHtml = `<h3>Economic Dispatch Results</h3><table>
                        <tr><th>Generator</th><th>Scheduled Power (MW)</th><th>Cost (₹)</th></tr>`;
    generators.forEach(g => {
        let cost = 0;
        if (g.allocated > 0) {
            cost = g.a * g.allocated ** 2 + g.b * g.allocated + g.c;
            totalCost += cost;
        }
        resultHtml += `<tr><td>G${g.id}</td><td>${g.allocated.toFixed(2)}</td><td>${cost.toFixed(2)}</td></tr>`;
    });
    resultHtml += `</table><h4>Total Cost: ${totalCost.toFixed(2)} ₹</h4>`;
    resultHtml += `<h4>Lambda (Marginal Cost): ${lambda.toFixed(4)} ₹/MW</h4>`;
    resultHtml += `<h4>Total Generation: ${generators.reduce((sum, g) => sum + g.allocated, 0).toFixed(2)} MW</h4>`;
    resultHtml += `<h4>Total Demand: ${loadDemand.toFixed(2)} MW</h4>`;
    document.getElementById("results").innerHTML = resultHtml;
}
