/* ==========================================================================
   EcoTrace Application Logic (Calculator, Tracker, Simulator, Logger)
   ========================================================================== */

// --- Global Application State ---
let state = {
  inputs: {
    // Transportation
    carType: 'medium-gas',
    carDistance: 120,
    transitHours: 4,
    flightsShort: 2,
    flightsLong: 1,
    // Home Energy
    householdSize: 2,
    electricityBill: 110,
    cleanEnergyShare: 15,
    heatingFuel: 'natural-gas',
    heatingBill: 70,
    // Diet & Food
    dietProfile: 'average-meat',
    foodWaste: 'average',
    localFoodShare: 20,
    // Shopping & Waste
    shoppingHabits: 'average',
    recyclePaper: true,
    recyclePlastic: true,
    recycleGlass: true,
    recycleMetal: false
  },
  committedActions: [],
  dailyLogHistory: [],
  userPoints: 120
};

// --- Emission Conversion Constants (kg CO₂e) ---
const FACTORS = {
  // Transporation (per mile)
  car: {
    'none': 0,
    'medium-gas': 0.35,
    'large-gas': 0.52,
    'diesel': 0.32,
    'hybrid': 0.19,
    'ev': 0.08
  },
  transitMile: 0.05, // Assumed average transit speed 25 mph
  flightShort: 220,  // Short-haul (takeoff-heavy)
  flightLong: 850,   // Long-haul

  // Home Energy
  electricityKwh: 0.38,   // kg CO2 per kWh
  electricityKwhCost: 0.16, // $ per kWh
  naturalGasTherm: 5.3,   // kg CO2 per therm
  naturalGasThermCost: 1.20, // $ per therm
  heatingOilGal: 8.5,     // kg CO2 per gallon
  heatingOilGalCost: 3.80,  // $ per gallon
  propaneGal: 5.72,       // kg CO2 per gallon
  propaneGalCost: 2.80,    // $ per gallon

  // Diet (Annual base)
  diet: {
    'heavy-meat': 3000,
    'average-meat': 2000,
    'pescatarian': 1400,
    'vegetarian': 1100,
    'vegan': 700
  },
  // Waste (Annual reduction credit per item recycled)
  recycle: {
    paper: -80,
    plastic: -50,
    glass: -40,
    metal: -100
  },
  shopping: {
    'high': 1800,
    'average': 1000,
    'frugal': 400
  }
};

// --- Action Center Definitions ---
const REDUCTION_ACTIONS = [
  {
    id: 'act-solar',
    title: 'Switch to 100% Clean Electricity',
    description: 'Install solar panels or subscribe to a 100% green energy plan with your local utility provider.',
    category: 'energy',
    impact: 'High Impact',
    savingsFn: (totals, inputs) => {
      const elecAnnual = ((inputs.electricityBill / FACTORS.electricityKwhCost) * 12 * FACTORS.electricityKwh * (1 - inputs.cleanEnergyShare / 100)) / inputs.householdSize;
      return Math.round(elecAnnual);
    }
  },
  {
    id: 'act-ev',
    title: 'Switch to an Electric Vehicle (EV)',
    description: 'Transition from gasoline to an electric car, reducing tailpipe emissions to zero.',
    category: 'transport',
    impact: 'High Impact',
    savingsFn: (totals) => {
      return Math.round(totals.transportSubtotals.car * 0.77); // EV has ~77% lower emissions factoring average charging grid
    }
  },
  {
    id: 'act-meatless',
    title: 'Implement Meatless Days',
    description: 'Swap meat for vegetarian/vegan meals 3 days a week.',
    category: 'diet',
    impact: 'Medium Impact',
    savingsFn: (totals) => {
      // Shifting from meat/average diet downwards saves approx 20% of diet emissions
      return Math.round(totals.diet * 0.20);
    }
  },
  {
    id: 'act-thermostat',
    title: 'Install a Smart Thermostat',
    description: 'Optimize heating and cooling schedules, lowering temperatures by 2°F in winter and raising by 2°F in summer.',
    category: 'energy',
    impact: 'Medium Impact',
    savingsFn: (totals) => {
      return Math.round(totals.energySubtotals.heating * 0.10); // average 10% heating bill savings
    }
  },
  {
    id: 'act-led',
    title: 'Upgrade Home to LED Lighting',
    description: 'Replace standard incandescent bulbs with energy-efficient LEDs.',
    category: 'energy',
    impact: 'Easy Win',
    savingsFn: () => 150 // standard saving estimate
  },
  {
    id: 'act-transit',
    title: 'Public Transit for Commutes',
    description: 'Replace half of your driving trips with bus, subway, or rail transit.',
    category: 'transport',
    impact: 'High Impact',
    savingsFn: (totals) => {
      return Math.round(totals.transportSubtotals.car * 0.45);
    }
  },
  {
    id: 'act-frugal',
    title: 'Frugal / Second-hand Shopping',
    description: 'Buy clothing and electronics second-hand, reducing consumption emissions.',
    category: 'consumption',
    impact: 'Medium Impact',
    savingsFn: (totals) => {
      return Math.round(totals.consumptionSubtotals.shopping * 0.40);
    }
  },
  {
    id: 'act-line-dry',
    title: 'Line-Dry Clothes',
    description: 'Air dry clothes instead of using an electric tumble dryer.',
    category: 'energy',
    impact: 'Easy Win',
    savingsFn: () => 200 // standard dryer offset
  }
];

// --- Charts References ---
let dashboardChartInstance = null;
let simulatorChartInstance = null;

// --- Initialize App ---
document.addEventListener('DOMContentLoaded', () => {
  loadStateFromLocalStorage();
  setupEventListeners();
  updateUI();
});

// --- Local Storage Management ---
function saveStateToLocalStorage() {
  localStorage.setItem('ecotrace_state', JSON.stringify(state));
}

function loadStateFromLocalStorage() {
  const saved = localStorage.getItem('ecotrace_state');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      // Ensure backward compatibility if properties differ
      state = { ...state, ...parsed };
      // Hydrate forms with saved inputs
      hydrateInputsForm();
    } catch (e) {
      console.error('Error parsing local storage state, using defaults', e);
    }
  } else {
    // Pre-calculate baseline on first launch
    saveStateToLocalStorage();
  }
}

function hydrateInputsForm() {
  const inputs = state.inputs;
  // Transportation
  document.getElementById('car-type').value = inputs.carType;
  document.getElementById('car-distance').value = inputs.carDistance;
  document.getElementById('car-distance-val').innerText = `${inputs.carDistance} miles`;
  document.getElementById('transit-hours').value = inputs.transitHours;
  document.getElementById('transit-hours-val').innerText = `${inputs.transitHours} hours`;
  document.getElementById('flights-short').value = inputs.flightsShort;
  document.getElementById('flights-long').value = inputs.flightsLong;
  // Energy
  document.getElementById('household-size').value = inputs.householdSize;
  document.getElementById('electricity-bill').value = inputs.electricityBill;
  document.getElementById('electricity-bill-val').innerText = `$${inputs.electricityBill}`;
  document.getElementById('clean-energy').value = inputs.cleanEnergyShare;
  document.getElementById('clean-energy-val').innerText = `${inputs.cleanEnergyShare}%`;
  document.getElementById('heating-fuel').value = inputs.heatingFuel;
  document.getElementById('gas-bill').value = inputs.heatingBill;
  // Diet
  document.getElementById('diet-profile').value = inputs.dietProfile;
  document.getElementById('food-waste').value = inputs.foodWaste;
  document.getElementById('local-food').value = inputs.localFoodShare;
  document.getElementById('local-food-val').innerText = `${inputs.localFoodShare}%`;
  // Shopping
  document.getElementById('shopping-habits').value = inputs.shoppingHabits;
  document.getElementById('recycle-paper').checked = inputs.recyclePaper;
  document.getElementById('recycle-plastic').checked = inputs.recyclePlastic;
  document.getElementById('recycle-glass').checked = inputs.recycleGlass;
  document.getElementById('recycle-metal').checked = inputs.recycleMetal;

  // Simulator defaults synchronised to baseline
  document.getElementById('sim-clean-electricity').value = inputs.cleanEnergyShare;
  document.getElementById('sim-clean-electricity-val').innerText = `${inputs.cleanEnergyShare}%`;
  document.getElementById('sim-plant-share').value = getDietPlantPercentage(inputs.dietProfile);
  document.getElementById('sim-plant-share-val').innerText = `${getDietPlantPercentage(inputs.dietProfile)}%`;
}

function getDietPlantPercentage(profile) {
  if (profile === 'vegan') return 100;
  if (profile === 'vegetarian') return 80;
  if (profile === 'pescatarian') return 60;
  if (profile === 'average-meat') return 20;
  return 10;
}

// --- Navigation / Event Listeners Setup ---
function setupEventListeners() {
  // SPA Tabs Navigation
  const navLinks = document.querySelectorAll('.nav-link');
  const sections = document.querySelectorAll('.view-section');

  navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const targetId = link.getAttribute('href').substring(1);
      
      navLinks.forEach(l => l.classList.remove('active'));
      sections.forEach(s => s.classList.remove('active'));
      
      link.classList.add('active');
      document.getElementById(targetId).classList.add('active');

      // Scroll to top of section
      window.scrollTo(0, 0);

      // Re-trigger layout or charts sizing if active
      if (targetId === 'dashboard') {
        renderDashboardChart();
      } else if (targetId === 'simulator') {
        runSimulation();
      }
    });
  });

  // Calculator Form Sliders Live Text Updates
  const sliders = [
    { id: 'car-distance', valId: 'car-distance-val', suffix: ' miles' },
    { id: 'transit-hours', valId: 'transit-hours-val', suffix: ' hours' },
    { id: 'electricity-bill', valId: 'electricity-bill-val', prefix: '$' },
    { id: 'clean-energy', valId: 'clean-energy-val', suffix: '%' },
    { id: 'local-food', valId: 'local-food-val', suffix: '%' }
  ];

  sliders.forEach(slider => {
    const el = document.getElementById(slider.id);
    const valEl = document.getElementById(slider.valId);
    if (el && valEl) {
      el.addEventListener('input', () => {
        valEl.innerText = `${slider.prefix || ''}${el.value}${slider.suffix || ''}`;
      });
    }
  });

  // Calculate Button
  document.getElementById('calculate-btn').addEventListener('click', (e) => {
    e.preventDefault();
    readInputsFromForm();
    saveStateToLocalStorage();
    updateUI();
    // Redirect to Dashboard
    document.getElementById('nav-dashboard-link').click();
  });

  // Dashboard Recalculate Button
  document.getElementById('recalc-btn-dash').addEventListener('click', () => {
    document.getElementById('nav-calculator-link').click();
  });

  // Daily Habits Log Form
  document.getElementById('daily-log-form').addEventListener('submit', (e) => {
    e.preventDefault();
    submitDailyLog();
  });

  // Clear log history
  document.getElementById('clear-history-btn').addEventListener('click', () => {
    if (confirm('Are you sure you want to clear your green habit history?')) {
      state.dailyLogHistory = [];
      saveStateToLocalStorage();
      updateHabitsLogHistoryTable();
    }
  });

  // Simulator Sliders Live Simulation
  const simSliders = ['sim-clean-electricity', 'sim-ev-share', 'sim-plant-share', 'sim-heating-temp'];
  simSliders.forEach(sliderId => {
    const el = document.getElementById(sliderId);
    if (el) {
      el.addEventListener('input', () => {
        let suffix = '%';
        if (sliderId === 'sim-heating-temp') {
          const val = parseInt(el.value);
          suffix = val >= 0 ? `+${val}°F` : `${val}°F`;
          document.getElementById(`${sliderId}-val`).innerText = suffix;
        } else {
          document.getElementById(`${sliderId}-val`).innerText = `${el.value}${suffix}`;
        }
        runSimulation();
      });
    }
  });

  // Show/Hide Heating Input based on source selection
  document.getElementById('heating-fuel').addEventListener('change', (e) => {
    const gasGroup = document.getElementById('gas-bill-group');
    if (e.target.value === 'none') {
      gasGroup.style.display = 'none';
    } else {
      gasGroup.style.display = 'block';
    }
  });
}

// Read and parse current UI inputs
function readInputsFromForm() {
  state.inputs = {
    carType: document.getElementById('car-type').value,
    carDistance: parseInt(document.getElementById('car-distance').value),
    transitHours: parseInt(document.getElementById('transit-hours').value),
    flightsShort: parseInt(document.getElementById('flights-short').value) || 0,
    flightsLong: parseInt(document.getElementById('flights-long').value) || 0,
    
    householdSize: parseInt(document.getElementById('household-size').value),
    electricityBill: parseInt(document.getElementById('electricity-bill').value),
    cleanEnergyShare: parseInt(document.getElementById('clean-energy').value),
    heatingFuel: document.getElementById('heating-fuel').value,
    heatingBill: parseInt(document.getElementById('gas-bill').value) || 0,
    
    dietProfile: document.getElementById('diet-profile').value,
    foodWaste: document.getElementById('food-waste').value,
    localFoodShare: parseInt(document.getElementById('local-food').value),
    
    shoppingHabits: document.getElementById('shopping-habits').value,
    recyclePaper: document.getElementById('recycle-paper').checked,
    recyclePlastic: document.getElementById('recycle-plastic').checked,
    recycleGlass: document.getElementById('recycle-glass').checked,
    recycleMetal: document.getElementById('recycle-metal').checked
  };
}

// --- Main Calculator Logic ---
function calculateCarbonFootprint(inputs) {
  // 1. Transportation
  const carFactor = FACTORS.car[inputs.carType];
  const carEmissions = inputs.carDistance * 52 * carFactor; // kg/year
  
  const transitDistance = inputs.transitHours * 25; // assume 25mph average speed
  const transitEmissions = transitDistance * 52 * FACTORS.transitMile;
  
  const shortFlightEmissions = inputs.flightsShort * FACTORS.flightShort;
  const longFlightEmissions = inputs.flightsLong * FACTORS.flightLong;
  
  const transportTotal = carEmissions + transitEmissions + shortFlightEmissions + longFlightEmissions;
  const transportSubtotals = {
    car: carEmissions,
    transit: transitEmissions,
    flights: shortFlightEmissions + longFlightEmissions
  };

  // 2. Home Energy
  // Electricity
  const kwhAnnual = (inputs.electricityBill / FACTORS.electricityKwhCost) * 12;
  const electricityEmissions = (kwhAnnual * FACTORS.electricityKwh * (1 - inputs.cleanEnergyShare / 100)) / inputs.householdSize;
  
  // Heating
  let heatingFactor = 0;
  let heatingFactorCost = 1;
  switch (inputs.heatingFuel) {
    case 'natural-gas':
      heatingFactor = FACTORS.naturalGasTherm;
      heatingFactorCost = FACTORS.naturalGasThermCost;
      break;
    case 'oil':
      heatingFactor = FACTORS.heatingOilGal;
      heatingFactorCost = FACTORS.heatingOilGalCost;
      break;
    case 'propane':
      heatingFactor = FACTORS.propaneGal;
      heatingFactorCost = FACTORS.propaneGalCost;
      break;
    case 'electricity':
      // Assumes modern heat pump, uses grid electric calculations at a slightly lower offset
      heatingFactor = FACTORS.electricityKwh * 0.4; // efficient heating
      heatingFactorCost = FACTORS.electricityKwhCost;
      break;
    default:
      heatingFactor = 0;
  }
  const heatingEmissions = inputs.heatingFuel === 'none' ? 0 : 
    ((inputs.heatingBill / heatingFactorCost) * 12 * heatingFactor) / inputs.householdSize;
  
  const energyTotal = electricityEmissions + heatingEmissions;
  const energySubtotals = {
    electricity: electricityEmissions,
    heating: heatingEmissions
  };

  // 3. Diet & Food
  let dietBase = FACTORS.diet[inputs.dietProfile];
  // Local food reduction: reduces diet footprint by up to 15%
  let localMultiplier = 1 - (inputs.localFoodShare / 100) * 0.15;
  // Waste modifier: high +20%, average 0%, minimal -10%
  let wasteMultiplier = 1;
  if (inputs.foodWaste === 'high') wasteMultiplier = 1.20;
  if (inputs.foodWaste === 'minimal') wasteMultiplier = 0.90;

  const dietTotal = dietBase * localMultiplier * wasteMultiplier;

  // 4. Consumption & Waste
  const shoppingBase = FACTORS.shopping[inputs.shoppingHabits];
  
  // Recycling offset credits
  let recycleCredits = 0;
  if (inputs.recyclePaper) recycleCredits += FACTORS.recycle.paper;
  if (inputs.recyclePlastic) recycleCredits += FACTORS.recycle.plastic;
  if (inputs.recycleGlass) recycleCredits += FACTORS.recycle.glass;
  if (inputs.recycleMetal) recycleCredits += FACTORS.recycle.metal;

  const consumptionTotal = Math.max(100, shoppingBase + recycleCredits); // limit credits to keep base footprint positive
  const consumptionSubtotals = {
    shopping: shoppingBase,
    recycle: recycleCredits
  };

  const grandTotalKg = transportTotal + energyTotal + dietTotal + consumptionTotal;
  const grandTotalTons = grandTotalKg / 1000;

  return {
    totalTons: parseFloat(grandTotalTons.toFixed(2)),
    totalKg: grandTotalKg,
    transport: transportTotal,
    transportSubtotals,
    energy: energyTotal,
    energySubtotals,
    diet: dietTotal,
    consumption: consumptionTotal,
    consumptionSubtotals
  };
}

// --- Main UI Updater ---
function updateUI() {
  // 1. Set Date
  const dateOptions = { year: 'numeric', month: 'long', day: 'numeric' };
  document.getElementById('header-date').innerText = new Date().toLocaleDateString('en-US', dateOptions);

  // 2. Compute Footprint
  const totals = calculateCarbonFootprint(state.inputs);

  // 3. Update Dashboard Numbers
  document.getElementById('total-emissions').innerText = totals.totalTons.toFixed(1);
  
  // Update Ring Dial
  // Circle circumference is 565.48. If emissions are 0 tons, offset is 565.48. If emissions >= 25 tons (max scale), offset is 0.
  const circleElement = document.getElementById('footprint-circle');
  const maxEmissionsScale = 22.0; // Metric Tons
  const percentageOfMax = Math.min(totals.totalTons / maxEmissionsScale, 1.0);
  const strokeOffset = 565.48 - (percentageOfMax * 565.48);
  circleElement.style.strokeDashoffset = strokeOffset;

  // Update Status Badge
  const statusBadge = document.getElementById('emissions-status-badge');
  statusBadge.className = 'status-indicator';
  if (totals.totalTons > 12) {
    statusBadge.innerText = 'High Impact';
    statusBadge.classList.add('high');
  } else if (totals.totalTons > 6) {
    statusBadge.innerText = 'Moderate Impact';
    statusBadge.classList.add('moderate');
  } else {
    statusBadge.innerText = 'Climate Hero';
    statusBadge.classList.add('low');
  }

  // 4. Update Comparative Stats
  // Global target for 1.5C warming is approx 2.0 Metric Tons CO2e/year per capita.
  const globalTarget = 2.0;
  const vsTargetPercentage = Math.round(((totals.totalTons - globalTarget) / globalTarget) * 100);
  const vsGlobalTargetEl = document.getElementById('vs-global-target');
  
  if (vsTargetPercentage >= 0) {
    vsGlobalTargetEl.innerText = `+${vsTargetPercentage}%`;
    vsGlobalTargetEl.style.color = 'var(--color-danger)';
    document.getElementById('vs-global-desc').innerText = 'Above global 1.5°C ceiling';
  } else {
    vsGlobalTargetEl.innerText = `${vsTargetPercentage}%`;
    vsGlobalTargetEl.style.color = 'var(--color-primary)';
    document.getElementById('vs-global-desc').innerText = 'Below global 1.5°C target!';
  }

  // Tree Equivalency: 1 mature tree absorbs ~22kg of CO2 per year
  const treesRequired = Math.round(totals.totalKg / 22);
  document.getElementById('tree-offset-number').innerText = treesRequired.toLocaleString();

  // Points Display
  document.getElementById('points-display').innerText = state.userPoints;

  // 5. Build Dynamic Action Center Cards
  renderActionCards(totals);

  // 6. Update Active Strategy details
  updateStrategySummary(totals);

  // 7. Update Daily Log View
  updateHabitsLogHistoryTable();

  // 8. Load Personalized Insights
  generatePersonalizedInsights(totals);

  // 9. Render Category Chart
  renderDashboardChart(totals);
}

// --- Action Center Logic ---
function renderActionCards(totals) {
  const container = document.getElementById('actions-grid-container');
  container.innerHTML = '';

  REDUCTION_ACTIONS.forEach(action => {
    const savings = action.savingsFn(totals, state.inputs);
    const isCommitted = state.committedActions.includes(action.id);
    
    // Skip rendering if savings are 0 (e.g. they already don't drive a car, so EV swap yields 0 savings)
    if (savings <= 0) return;

    const card = document.createElement('div');
    card.className = `action-card ${isCommitted ? 'committed' : ''}`;
    card.id = `action-card-${action.id}`;

    card.innerHTML = `
      <div class="action-card-header">
        <span class="action-category-tag tag-${action.category}">${action.category}</span>
        <span class="action-impact-badge">${action.impact}</span>
      </div>
      <h4>${action.title}</h4>
      <p class="description">${action.description}</p>
      <div class="action-card-footer">
        <div class="action-saving-value">
          <span class="val">-${savings.toLocaleString()} kg</span>
          <span class="lbl">CO₂e Saved / yr</span>
        </div>
        <button class="btn-commit" onclick="toggleCommitAction('${action.id}')">
          ${isCommitted ? '<i class="fa-solid fa-check"></i> Committed' : 'Commit'}
        </button>
      </div>
    `;

    container.appendChild(card);
  });
}

window.toggleCommitAction = function(actionId) {
  const index = state.committedActions.indexOf(actionId);
  if (index > -1) {
    // Uncommit
    state.committedActions.splice(index, 1);
    state.userPoints = Math.max(0, state.userPoints - 15); // deduct points
  } else {
    // Commit
    state.committedActions.push(actionId);
    state.userPoints += 25; // reward points
    triggerConfettiEffect();
  }
  saveStateToLocalStorage();
  updateUI();
};

function updateStrategySummary(totals) {
  let totalSavings = 0;
  
  state.committedActions.forEach(actionId => {
    const action = REDUCTION_ACTIONS.find(a => a.id === actionId);
    if (action) {
      totalSavings += action.savingsFn(totals, state.inputs);
    }
  });

  document.getElementById('strategy-savings').innerText = totalSavings.toLocaleString();
  document.getElementById('active-challenges-count').innerText = `${state.committedActions.length} Active`;
  document.getElementById('challenges-subtext').innerText = `${Math.round(totalSavings / 22)} trees worth of reduction`;

  // Strategy reduction percentage
  const reductionPct = totals.totalKg > 0 ? Math.min(Math.round((totalSavings / totals.totalKg) * 100), 100) : 0;
  document.getElementById('strategy-pct').innerText = `${reductionPct}%`;
  document.getElementById('strategy-progress-bar').style.width = `${reductionPct}%`;
}

// --- Insights Generator ---
function generatePersonalizedInsights(totals) {
  const container = document.getElementById('insights-list');
  container.innerHTML = '';

  const insights = [];

  // Transport insights
  const transportPct = (totals.transport / totals.totalKg) * 100;
  if (transportPct > 40) {
    insights.push({
      type: 'alert',
      icon: 'fa-solid fa-car',
      text: `<strong>Transportation</strong> accounts for <strong>${Math.round(transportPct)}%</strong> of your carbon output. Consider switching to cycling for short trips, combining errands, or carpooling.`
    });
  } else if (totals.transportSubtotals.flights > 2000) {
    insights.push({
      type: 'alert',
      icon: 'fa-solid fa-plane-departure',
      text: `Your air travel generates <strong>${Math.round(totals.transportSubtotals.flights / 1000)} Tons</strong> of CO₂ annually. Offsetting flights or choosing train travel when possible can significantly reduce this.`
    });
  }

  // Energy insights
  const energyPct = (totals.energy / totals.totalKg) * 100;
  if (energyPct > 35) {
    insights.push({
      type: 'alert',
      icon: 'fa-solid fa-plug',
      text: `Your <strong>Home Energy</strong> footprint is high (<strong>${Math.round(energyPct)}%</strong>). Switching to LEDs, adjusting heating thermostats down by 2°F, or subscribing to clean solar grid options will drop this instantly.`
    });
  }

  // Diet insights
  const dietPct = (totals.diet / totals.totalKg) * 100;
  if (state.inputs.dietProfile === 'heavy-meat') {
    insights.push({
      type: 'alert',
      icon: 'fa-solid fa-utensils',
      text: `A high-meat diet creates heavy methane emissions. Shifting just 2 dinners a week to plant-based meals cuts up to <strong>400 kg CO₂e</strong> yearly.`
    });
  } else if (state.inputs.dietProfile === 'vegan' || state.inputs.dietProfile === 'vegetarian') {
    insights.push({
      type: 'positive',
      icon: 'fa-solid fa-seedling',
      text: `Fantastic! Your plant-based diet saves roughly <strong>1,300 kg CO₂e</strong> annually compared to the regional average diet. You are leading the charge!`
    });
  }

  // Recycling insights
  const activeRecycling = [state.inputs.recyclePaper, state.inputs.recyclePlastic, state.inputs.recycleGlass, state.inputs.recycleMetal];
  const recycleCount = activeRecycling.filter(Boolean).length;
  if (recycleCount < 3) {
    insights.push({
      type: 'neutral',
      icon: 'fa-solid fa-recycle',
      text: `Enhance your garbage sorting. Recycling paper, glass, and metals can add carbon credits and reduce secondary emissions by up to <strong>270 kg CO₂e</strong> per year.`
    });
  } else {
    insights.push({
      type: 'positive',
      icon: 'fa-solid fa-thumbs-up',
      text: `Great work recycling! Your persistent sorting acts as an annual sink, offsetting <strong>${Math.abs(totals.consumptionSubtotals.recycle)} kg CO₂e</strong>.`
    });
  }

  // Default insight if empty
  if (insights.length === 0) {
    insights.push({
      type: 'positive',
      icon: 'fa-solid fa-circle-check',
      text: `Your footprint is beautifully balanced! Focus on locking in your current habits and encouraging friends to calculate their footprint.`
    });
  }

  insights.forEach(ins => {
    const el = document.createElement('div');
    el.className = `insight-item ${ins.type}`;
    el.innerHTML = `
      <i class="${ins.icon}"></i>
      <p>${ins.text}</p>
    `;
    container.appendChild(el);
  });
}

// --- Daily Logging System ---
function submitDailyLog() {
  const checkedHabits = document.querySelectorAll('input[name="habit"]:checked');
  if (checkedHabits.length === 0) {
    alert('Please select at least one green habit to log.');
    return;
  }

  let pointsEarned = 0;
  let carbonReduced = 0;
  const habitsLogged = [];

  checkedHabits.forEach(cb => {
    pointsEarned += parseInt(cb.dataset.points);
    carbonReduced += parseFloat(cb.dataset.savings);
    habitsLogged.push(cb.parentNode.querySelector('.log-title').innerText);
    // Uncheck habit for next log
    cb.checked = false;
  });

  // Create log entry
  const entry = {
    date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    habits: habitsLogged,
    points: pointsEarned,
    savings: parseFloat(carbonReduced.toFixed(1))
  };

  // Add to state
  state.dailyLogHistory.unshift(entry); // add to front
  state.userPoints += pointsEarned;
  saveStateToLocalStorage();
  
  // Trigger effects and update UI
  triggerConfettiEffect();
  updateUI();
  
  // Flash success visual indicator on points
  const pointsEl = document.querySelector('.user-points');
  pointsEl.style.transform = 'scale(1.2)';
  setTimeout(() => pointsEl.style.transform = '', 300);
}

function updateHabitsLogHistoryTable() {
  const tbody = document.getElementById('history-tbody');
  tbody.innerHTML = '';

  if (state.dailyLogHistory.length === 0) {
    tbody.innerHTML = `
      <tr class="empty-row-placeholder">
        <td colspan="4" class="text-center">No habits logged yet. Start today!</td>
      </tr>
    `;
    return;
  }

  state.dailyLogHistory.forEach(entry => {
    const tr = document.createElement('tr');
    
    // Habits markup
    const habitsMarkup = entry.habits.map(h => `<span class="habit-tag-inline">${h}</span>`).join('');
    
    tr.innerHTML = `
      <td>${entry.date}</td>
      <td>${habitsMarkup}</td>
      <td class="history-points">+${entry.points} pts</td>
      <td class="history-reduction">-${entry.savings} kg CO₂e</td>
    `;
    
    tbody.appendChild(tr);
  });
}

// --- Simulator Logic ---
function runSimulation() {
  const cleanElec = parseInt(document.getElementById('sim-clean-electricity').value);
  const evShare = parseInt(document.getElementById('sim-ev-share').value);
  const plantShare = parseInt(document.getElementById('sim-plant-share').value);
  const heatTempOffset = parseInt(document.getElementById('sim-heating-temp').value);

  // Compute baseline
  const base = calculateCarbonFootprint(state.inputs);

  // Calculate simulated modifications
  // 1. Clean electricity percentage adjustment
  const kwhAnnual = (state.inputs.electricityBill / FACTORS.electricityKwhCost) * 12;
  const simElecEmissions = (kwhAnnual * FACTORS.electricityKwh * (1 - cleanElec / 100)) / state.inputs.householdSize;
  
  // 2. Heating temperature offset: roughly 3% energy reduction per °F offset in direction of savings (negative offset)
  // Let's assume positive values represent standard, negative represents eco-thermostat setback (savings)
  const heatingBaseline = base.energySubtotals.heating;
  // If heatTempOffset is negative, they dial down heat -> saves energy. If positive, they heat more.
  const tempMultiplier = 1 + (heatTempOffset * 0.03); 
  const simHeatingEmissions = Math.max(0, heatingBaseline * tempMultiplier);
  
  const simEnergyTotal = simElecEmissions + simHeatingEmissions;

  // 3. EV Share: replaces car emissions by percentage
  const baseCarEmissions = base.transportSubtotals.car;
  // The fraction that gets converted to EV will be reduced by EV savings factor (~77%)
  const simCarEmissions = baseCarEmissions * (1 - (evShare / 100) * 0.77);
  const simTransportTotal = simCarEmissions + base.transportSubtotals.transit + base.transportSubtotals.flights;

  // 4. Plant diet share adjustment
  // Map simulated plant percentage (0 to 100) to diet base emissions linear progression
  // 0% plant diet base ~ 3000 kg, 100% plant diet base (Vegan) ~ 700 kg
  const minDiet = 700;
  const maxDiet = 3000;
  // Linear interpolation: higher plant percentage leads to lower diet emissions
  const simDietBase = maxDiet - (plantShare / 100) * (maxDiet - minDiet);
  
  let localMultiplier = 1 - (state.inputs.localFoodShare / 100) * 0.15;
  let wasteMultiplier = 1;
  if (state.inputs.foodWaste === 'high') wasteMultiplier = 1.20;
  if (state.inputs.foodWaste === 'minimal') wasteMultiplier = 0.90;

  const simDietTotal = simDietBase * localMultiplier * wasteMultiplier;

  // Consumption remains constant in simulator for baseline comparison
  const simConsumptionTotal = base.consumption;

  const simGrandTotalKg = simTransportTotal + simEnergyTotal + simDietTotal + simConsumptionTotal;
  const simGrandTotalTons = simGrandTotalKg / 1000;

  // Update simulator display
  document.getElementById('sim-baseline-val').innerText = base.totalTons.toFixed(1);
  document.getElementById('sim-projected-val').innerText = simGrandTotalTons.toFixed(1);

  // Compute savings
  const tonsSaved = Math.max(0, base.totalTons - simGrandTotalTons);
  const percentReduced = base.totalTons > 0 ? Math.round((tonsSaved / base.totalTons) * 100) : 0;

  document.getElementById('sim-percent-reduction').innerText = `${percentReduced}%`;
  document.getElementById('sim-tons-saved').innerText = tonsSaved.toFixed(1);

  // Update Simulator Bar Chart
  renderSimulatorChart(base, {
    transport: simTransportTotal,
    energy: simEnergyTotal,
    diet: simDietTotal,
    consumption: simConsumptionTotal
  });
}

// --- Visualizations Rendering (Chart.js) ---
function renderDashboardChart(totals) {
  if (!totals) {
    totals = calculateCarbonFootprint(state.inputs);
  }

  const ctx = document.getElementById('emissionsChart').getContext('2d');

  const chartData = {
    labels: ['Transportation', 'Home Energy', 'Diet & Food', 'Shopping & Waste'],
    datasets: [{
      data: [
        Math.round(totals.transport),
        Math.round(totals.energy),
        Math.round(totals.diet),
        Math.round(totals.consumption)
      ],
      backgroundColor: [
        'rgba(6, 182, 212, 0.75)',  // Transport (Cyan)
        'rgba(245, 158, 11, 0.75)', // Energy (Amber)
        'rgba(16, 185, 129, 0.75)', // Diet (Emerald)
        'rgba(139, 92, 246, 0.75)'  // Consumption (Violet)
      ],
      borderColor: [
        '#06b6d4',
        '#f59e0b',
        '#10b981',
        '#8b5cf6'
      ],
      borderWidth: 1.5
    }]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'right',
        labels: {
          color: '#e2e8f0',
          font: {
            family: 'Outfit',
            size: 13
          },
          padding: 15
        }
      },
      tooltip: {
        callbacks: {
          label: function(context) {
            const val = context.raw;
            const percentage = Math.round((val / totals.totalKg) * 100);
            return ` ${context.label}: ${val.toLocaleString()} kg CO₂e (${percentage}%)`;
          }
        }
      }
    },
    cutout: '65%'
  };

  if (dashboardChartInstance) {
    dashboardChartInstance.data = chartData;
    dashboardChartInstance.update();
  } else {
    dashboardChartInstance = new Chart(ctx, {
      type: 'doughnut',
      data: chartData,
      options: chartOptions
    });
  }
}

function renderSimulatorChart(baseTotals, simTotals) {
  const ctx = document.getElementById('simChart').getContext('2d');

  const chartData = {
    labels: ['Transport', 'Home Energy', 'Diet', 'Consumption'],
    datasets: [
      {
        label: 'Current Baseline',
        data: [
          Math.round(baseTotals.transport),
          Math.round(baseTotals.energy),
          Math.round(baseTotals.diet),
          Math.round(baseTotals.consumption)
        ],
        backgroundColor: 'rgba(255, 255, 255, 0.15)',
        borderColor: 'rgba(255, 255, 255, 0.3)',
        borderWidth: 1
      },
      {
        label: 'Simulated Change',
        data: [
          Math.round(simTotals.transport),
          Math.round(simTotals.energy),
          Math.round(simTotals.diet),
          Math.round(simTotals.consumption)
        ],
        backgroundColor: 'rgba(16, 185, 129, 0.6)',
        borderColor: '#10b981',
        borderWidth: 1.5
      }
    ]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: {
        ticks: { color: '#94a3b8', font: { family: 'Outfit' } },
        grid: { display: false }
      },
      y: {
        ticks: { color: '#94a3b8', font: { family: 'Outfit' } },
        grid: { color: 'rgba(255, 255, 255, 0.05)' }
      }
    },
    plugins: {
      legend: {
        position: 'top',
        labels: {
          color: '#e2e8f0',
          font: { family: 'Outfit', size: 12 }
        }
      }
    }
  };

  if (simulatorChartInstance) {
    simulatorChartInstance.data = chartData;
    simulatorChartInstance.update();
  } else {
    simulatorChartInstance = new Chart(ctx, {
      type: 'bar',
      data: chartData,
      options: chartOptions
    });
  }
}

// --- Confetti & Micro-Animations Effect ---
function triggerConfettiEffect() {
  // Pure CSS simple floating bubble explosion since we can't load external heavy libraries
  const effectContainer = document.createElement('div');
  effectContainer.style.position = 'fixed';
  effectContainer.style.top = '0';
  effectContainer.style.left = '0';
  effectContainer.style.width = '100vw';
  effectContainer.style.height = '100vh';
  effectContainer.style.pointerEvents = 'none';
  effectContainer.style.zIndex = '999';
  document.body.appendChild(effectContainer);

  const colors = ['#10b981', '#06b6d4', '#3b82f6', '#f59e0b'];

  for (let i = 0; i < 35; i++) {
    const bubble = document.createElement('div');
    const size = Math.random() * 8 + 6;
    const color = colors[Math.floor(Math.random() * colors.length)];

    bubble.style.position = 'absolute';
    bubble.style.width = `${size}px`;
    bubble.style.height = `${size}px`;
    bubble.style.backgroundColor = color;
    bubble.style.borderRadius = '50%';
    bubble.style.left = `${Math.random() * 100}vw`;
    bubble.style.bottom = '0';
    bubble.style.opacity = '0.85';
    bubble.style.filter = 'drop-shadow(0 0 2px rgba(255, 255, 255, 0.2))';

    effectContainer.appendChild(bubble);

    const animation = bubble.animate([
      { transform: 'translateY(0) rotate(0deg) translateX(0)', opacity: 0.95 },
      { transform: `translateY(-105vh) rotate(${Math.random() * 360}deg) translateX(${(Math.random() - 0.5) * 200}px)`, opacity: 0 }
    ], {
      duration: Math.random() * 2000 + 1500,
      easing: 'cubic-bezier(0.1, 0.8, 0.3, 1)'
    });

    animation.onfinish = () => bubble.remove();
  }

  // Cleanup container
  setTimeout(() => effectContainer.remove(), 4000);
}
