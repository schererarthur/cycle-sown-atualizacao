// Soil Analysis Engine - Real Agricultural Data
// Based on scientific research and agricultural best practices

// Crop Database with Real Nutrient Requirements
const cropDatabase = {
    'milho': {
        name: 'Milho (Corn)',
        phRange: [5.8, 7.0],
        optimalPh: 6.5,
        nutrients: {
            nitrogen: { optimal: 25, range: [20, 35] },
            phosphorus: { optimal: 15, range: [12, 25] },
            potassium: { optimal: 120, range: [100, 180] },
            calcium: { optimal: 800, range: [600, 1200] },
            magnesium: { optimal: 120, range: [80, 200] },
            sulfur: { optimal: 12, range: [8, 20] },
            iron: { optimal: 45, range: [30, 80] },
            manganese: { optimal: 25, range: [15, 50] },
            zinc: { optimal: 2.5, range: [1.5, 5.0] },
            copper: { optimal: 1.2, range: [0.8, 3.0] },
            boron: { optimal: 0.8, range: [0.5, 2.0] },
            molybdenum: { optimal: 0.15, range: [0.1, 0.3] }
        },
        compatibility: 0,
        image: ''
    },
    'soja': {
        name: 'Soja (Soybean)',
        phRange: [6.0, 7.2],
        optimalPh: 6.8,
        nutrients: {
            nitrogen: { optimal: 20, range: [15, 30] },
            phosphorus: { optimal: 18, range: [14, 28] },
            potassium: { optimal: 140, range: [110, 200] },
            calcium: { optimal: 1000, range: [800, 1500] },
            magnesium: { optimal: 150, range: [100, 250] },
            sulfur: { optimal: 15, range: [10, 25] },
            iron: { optimal: 50, range: [35, 90] },
            manganese: { optimal: 30, range: [20, 60] },
            zinc: { optimal: 3.0, range: [2.0, 6.0] },
            copper: { optimal: 1.5, range: [1.0, 3.5] },
            boron: { optimal: 1.0, range: [0.6, 2.5] },
            molybdenum: { optimal: 0.2, range: [0.12, 0.4] }
        },
        compatibility: 0,
        image: ''
    },
    'trigo': {
        name: 'Trigo (Wheat)',
        phRange: [6.0, 7.5],
        optimalPh: 6.8,
        nutrients: {
            nitrogen: { optimal: 30, range: [22, 40] },
            phosphorus: { optimal: 20, range: [15, 35] },
            potassium: { optimal: 160, range: [130, 220] },
            calcium: { optimal: 900, range: [700, 1400] },
            magnesium: { optimal: 140, range: [90, 220] },
            sulfur: { optimal: 18, range: [12, 28] },
            iron: { optimal: 40, range: [25, 70] },
            manganese: { optimal: 35, range: [22, 65] },
            zinc: { optimal: 2.8, range: [1.8, 5.5] },
            copper: { optimal: 1.8, range: [1.2, 4.0] },
            boron: { optimal: 1.2, range: [0.7, 2.8] },
            molybdenum: { optimal: 0.18, range: [0.12, 0.35] }
        },
        compatibility: 0,
        image: ''
    },
    'batata': {
        name: 'Batata (Potato)',
        phRange: [5.0, 6.5],
        optimalPh: 5.8,
        nutrients: {
            nitrogen: { optimal: 35, range: [25, 45] },
            phosphorus: { optimal: 25, range: [18, 40] },
            potassium: { optimal: 200, range: [160, 300] },
            calcium: { optimal: 600, range: [400, 1000] },
            magnesium: { optimal: 100, range: [60, 180] },
            sulfur: { optimal: 15, range: [10, 25] },
            iron: { optimal: 55, range: [35, 100] },
            manganese: { optimal: 40, range: [25, 80] },
            zinc: { optimal: 3.5, range: [2.0, 7.0] },
            copper: { optimal: 2.0, range: [1.2, 4.5] },
            boron: { optimal: 1.5, range: [0.8, 3.5] },
            molybdenum: { optimal: 0.12, range: [0.08, 0.25] }
        },
        compatibility: 0,
        image: ''
    },
    'tomate': {
        name: 'Tomate (Tomato)',
        phRange: [6.0, 7.0],
        optimalPh: 6.5,
        nutrients: {
            nitrogen: { optimal: 28, range: [20, 40] },
            phosphorus: { optimal: 22, range: [16, 35] },
            potassium: { optimal: 180, range: [140, 260] },
            calcium: { optimal: 1200, range: [900, 1800] },
            magnesium: { optimal: 200, range: [130, 320] },
            sulfur: { optimal: 20, range: [14, 32] },
            iron: { optimal: 60, range: [40, 110] },
            manganese: { optimal: 45, range: [28, 85] },
            zinc: { optimal: 4.0, range: [2.5, 8.0] },
            copper: { optimal: 2.5, range: [1.5, 5.5] },
            boron: { optimal: 2.0, range: [1.0, 4.0] },
            molybdenum: { optimal: 0.25, range: [0.15, 0.5] }
        },
        compatibility: 0,
        image: ''
    },
    'arroz': {
        name: 'Arroz (Rice)',
        phRange: [5.5, 7.0],
        optimalPh: 6.2,
        nutrients: {
            nitrogen: { optimal: 22, range: [16, 32] },
            phosphorus: { optimal: 12, range: [8, 20] },
            potassium: { optimal: 100, range: [80, 150] },
            calcium: { optimal: 700, range: [500, 1100] },
            magnesium: { optimal: 90, range: [60, 150] },
            sulfur: { optimal: 10, range: [6, 18] },
            iron: { optimal: 80, range: [50, 150] },
            manganese: { optimal: 50, range: [30, 100] },
            zinc: { optimal: 2.0, range: [1.2, 4.0] },
            copper: { optimal: 1.0, range: [0.6, 2.5] },
            boron: { optimal: 0.6, range: [0.3, 1.5] },
            molybdenum: { optimal: 0.1, range: [0.06, 0.2] }
        },
        compatibility: 0,
        image: ''
    },
    'cenoura': {
        name: 'Cenoura (Carrot)',
        phRange: [5.5, 7.0],
        optimalPh: 6.2,
        nutrients: {
            nitrogen: { optimal: 18, range: [12, 28] },
            phosphorus: { optimal: 28, range: [20, 45] },
            potassium: { optimal: 160, range: [120, 240] },
            calcium: { optimal: 800, range: [600, 1200] },
            magnesium: { optimal: 120, range: [80, 200] },
            sulfur: { optimal: 12, range: [8, 20] },
            iron: { optimal: 40, range: [25, 75] },
            manganese: { optimal: 25, range: [15, 50] },
            zinc: { optimal: 2.2, range: [1.3, 4.5] },
            copper: { optimal: 1.5, range: [0.9, 3.2] },
            boron: { optimal: 1.2, range: [0.6, 2.8] },
            molybdenum: { optimal: 0.15, range: [0.09, 0.3] }
        },
        compatibility: 0,
        image: ''
    },
    'alface': {
        name: 'Alface (Lettuce)',
        phRange: [6.0, 7.0],
        optimalPh: 6.5,
        nutrients: {
            nitrogen: { optimal: 32, range: [24, 45] },
            phosphorus: { optimal: 18, range: [12, 30] },
            potassium: { optimal: 140, range: [100, 210] },
            calcium: { optimal: 1000, range: [700, 1500] },
            magnesium: { optimal: 150, range: [100, 250] },
            sulfur: { optimal: 14, range: [9, 22] },
            iron: { optimal: 50, range: [30, 90] },
            manganese: { optimal: 30, range: [18, 60] },
            zinc: { optimal: 2.8, range: [1.6, 5.5] },
            copper: { optimal: 1.8, range: [1.0, 4.0] },
            boron: { optimal: 1.5, range: [0.8, 3.2] },
            molybdenum: { optimal: 0.18, range: [0.11, 0.35] }
        },
        compatibility: 0,
        image: ''
    },
    'morango': {
        name: 'Morango (Strawberry)',
        phRange: [5.5, 6.5],
        optimalPh: 6.0,
        nutrients: {
            nitrogen: { optimal: 20, range: [14, 30] },
            phosphorus: { optimal: 18, range: [12, 28] },
            potassium: { optimal: 130, range: [95, 200] },
            calcium: { optimal: 700, range: [500, 1100] },
            magnesium: { optimal: 110, range: [70, 180] },
            sulfur: { optimal: 12, range: [8, 20] },
            iron: { optimal: 45, range: [28, 85] },
            manganese: { optimal: 35, range: [20, 70] },
            zinc: { optimal: 2.8, range: [1.6, 5.8] },
            copper: { optimal: 1.6, range: [0.9, 3.5] },
            boron: { optimal: 1.8, range: [0.9, 3.8] },
            molybdenum: { optimal: 0.2, range: [0.12, 0.4] }
        },
        compatibility: 0,
        image: ''
    },
    'laranja': {
        name: 'Laranja (Orange)',
        phRange: [6.0, 7.5],
        optimalPh: 6.8,
        nutrients: {
            nitrogen: { optimal: 25, range: [18, 35] },
            phosphorus: { optimal: 15, range: [10, 25] },
            potassium: { optimal: 150, range: [110, 230] },
            calcium: { optimal: 2000, range: [1500, 3000] },
            magnesium: { optimal: 300, range: [200, 500] },
            sulfur: { optimal: 20, range: [14, 32] },
            iron: { optimal: 60, range: [35, 120] },
            manganese: { optimal: 45, range: [25, 90] },
            zinc: { optimal: 3.5, range: [2.0, 7.0] },
            copper: { optimal: 2.0, range: [1.0, 4.5] },
            boron: { optimal: 2.0, range: [1.0, 4.0] },
            molybdenum: { optimal: 0.15, range: [0.08, 0.3] }
        },
        compatibility: 0,
        image: ''
    }
};

// Soil analysis data structure
let soilData = {
    ph: null,
    organicMatter: null,
    nutrients: {
        nitrogen: null,
        phosphorus: null,
        potassium: null,
        calcium: null,
        magnesium: null,
        sulfur: null,
        iron: null,
        manganese: null,
        zinc: null,
        copper: null,
        boron: null,
        molybdenum: null
    }
};

// Initialize analysis system
function initializeAnalysis() {
    updateAnalysis();
    updateSavedReportCount();
    setInterval(updateAnalysis, 1000);
}

// Update soil analysis in real-time
function updateAnalysis() {
    // Get soil data from form inputs
    soilData.ph = parseFloat(document.getElementById('soilPH')?.value) || null;
    soilData.organicMatter = parseFloat(document.getElementById('organicMatter')?.value) || null;
    
    const nutrientIds = ['nitrogen', 'phosphorus', 'potassium', 'calcium', 'magnesium', 'sulfur', 
                        'iron', 'manganese', 'zinc', 'copper', 'boron', 'molybdenum'];
    
    nutrientIds.forEach(nutrient => {
        soilData.nutrients[nutrient] = parseFloat(document.getElementById(nutrient)?.value) || null;
    });
    
    // Update analysis dashboard
    updateHealthScore();
    updatePHCompatibility();
    updateNutrientStatus();
    updateQuickRecommendations();
    updateCropCompatibility();
}

// Calculate overall soil health score
function updateHealthScore() {
    let totalScore = 0;
    let factorsCount = 0;
    
    // pH score (0-100)
    if (soilData.ph !== null) {
        let phScore = 0;
        if (soilData.ph >= 6.0 && soilData.ph <= 7.0) {
            phScore = 100; // Optimal range
        } else if (soilData.ph >= 5.5 && soilData.ph <= 7.5) {
            phScore = 80 - Math.abs(soilData.ph - 6.5) * 20; // Good range
        } else if (soilData.ph >= 5.0 && soilData.ph <= 8.0) {
            phScore = 60 - Math.abs(soilData.ph - 6.5) * 15; // Acceptable range
        } else {
            phScore = Math.max(0, 40 - Math.abs(soilData.ph - 6.5) * 10); // Poor range
        }
        totalScore += phScore;
        factorsCount++;
    }
    
    // Organic matter score
    if (soilData.organicMatter !== null) {
        let omScore = Math.min(100, soilData.organicMatter * 25); // 4% = 100 points
        totalScore += omScore;
        factorsCount++;
    }
    
    // Nutrient scores
    Object.keys(soilData.nutrients).forEach(nutrient => {
        if (soilData.nutrients[nutrient] !== null) {
            let nutrientScore = calculateNutrientScore(nutrient, soilData.nutrients[nutrient]);
            totalScore += nutrientScore;
            factorsCount++;
        }
    });
    
    const healthScore = factorsCount > 0 ? Math.round(totalScore / factorsCount) : 0;
    
    const healthScoreElement = document.getElementById('healthScore');
    const healthBarElement = document.getElementById('healthBar');
    
    if (healthScoreElement) {
        healthScoreElement.textContent = healthScore;
        
        // Color based on score
        if (healthScore >= 80) {
            healthScoreElement.style.color = '#2D5016'; // Forest green
        } else if (healthScore >= 60) {
            healthScoreElement.style.color = '#87A96B'; // Sage green
        } else if (healthScore >= 40) {
            healthScoreElement.style.color = '#E6B17A'; // Golden wheat
        } else {
            healthScoreElement.style.color = '#B85450'; // Terracotta
        }
    }
    
    if (healthBarElement) {
        healthBarElement.style.width = `${healthScore}%`;
        
        // Color based on score
        if (healthScore >= 80) {
            healthBarElement.className = 'h-2 rounded-full transition-all duration-500 nutrient-optimal';
        } else if (healthScore >= 60) {
            healthBarElement.className = 'h-2 rounded-full transition-all duration-500 nutrient-adequate';
        } else if (healthScore >= 40) {
            healthBarElement.className = 'h-2 rounded-full transition-all duration-500 nutrient-low';
        } else {
            healthBarElement.className = 'h-2 rounded-full transition-all duration-500 nutrient-deficient';
        }
    }
}

// Calculate individual nutrient score
function calculateNutrientScore(nutrient, value, cropRef) {
    // Coerce value to numeric if it's an object like {val, ref} or a string
    if (value && typeof value === 'object' && 'val' in value) {
        value = parseFloat(value.val);
    } else {
        value = parseFloat(value);
    }
    if (isNaN(value)) return 0;

    // Determine reference crop: accept crop key string or crop object; default to 'milho'
    let referenceCrop = cropDatabase.milho;
    if (cropRef) {
        if (typeof cropRef === 'string' && cropDatabase[cropRef]) referenceCrop = cropDatabase[cropRef];
        else if (typeof cropRef === 'object' && cropRef.nutrients) referenceCrop = cropRef;
    }

    // Prefer the nutrient definition from the reference crop; fall back to milho if missing
    const nutrientDef = (referenceCrop.nutrients && referenceCrop.nutrients[nutrient]) || (cropDatabase.milho.nutrients[nutrient]);
    if (!nutrientDef) return 0;

    const range = nutrientDef.range;
    if (!range || range.length < 2) return 0;

    if (value >= range[0] && value <= range[1]) {
        return 100; // Optimal
    } else if (value < range[0]) {
        const deficiency = (range[0] - value) / range[0];
        return Math.max(0, 100 - deficiency * 150); // Severe deficiency = 0
    } else {
        const excess = (value - range[1]) / range[1];
        return Math.max(0, 100 - excess * 100); // Excess toxicity
    }
}

// Update pH compatibility indicators
function updatePHCompatibility() {
    if (soilData.ph === null) return;
    
    const acidCrops = document.getElementById('acidCrops');
    const neutralCrops = document.getElementById('neutralCrops');
    const alkalineCrops = document.getElementById('alkalineCrops');
    
    if (acidCrops && neutralCrops && alkalineCrops) {
        // Acid crops compatibility (5.0-6.0)
        let acidScore = 0;
        if (soilData.ph <= 6.0) {
            acidScore = Math.max(0, 100 - Math.abs(soilData.ph - 5.5) * 30);
        }
        
        // Neutral crops compatibility (6.0-7.0)
        let neutralScore = 0;
        if (soilData.ph >= 6.0 && soilData.ph <= 7.0) {
            neutralScore = 100 - Math.abs(soilData.ph - 6.5) * 40;
        }
        
        // Alkaline crops compatibility (7.0-8.0)
        let alkalineScore = 0;
        if (soilData.ph >= 7.0) {
            alkalineScore = Math.max(0, 100 - Math.abs(soilData.ph - 7.5) * 25);
        }
        
        acidCrops.style.width = `${acidScore}%`;
        neutralCrops.style.width = `${neutralScore}%`;
        alkalineCrops.style.width = `${alkalineScore}%`;
        
        // Update colors based on compatibility
        acidCrops.className = `h-2 rounded transition-all duration-500 ${acidScore > 60 ? 'nutrient-optimal' : acidScore > 30 ? 'nutrient-adequate' : 'nutrient-low'}`;
        neutralCrops.className = `h-2 rounded transition-all duration-500 ${neutralScore > 60 ? 'nutrient-optimal' : neutralScore > 30 ? 'nutrient-adequate' : 'nutrient-low'}`;
        alkalineCrops.className = `h-2 rounded transition-all duration-500 ${alkalineScore > 60 ? 'nutrient-optimal' : alkalineScore > 30 ? 'nutrient-adequate' : 'nutrient-low'}`;
    }
}

// Update nutrient status display
function updateNutrientStatus() {
    const nutrientStatusElement = document.getElementById('nutrientStatus');
    if (!nutrientStatusElement) return;
    
    let statusHTML = '';
    const nutrientNames = {
        nitrogen: 'Nitrogênio',
        phosphorus: 'Fósforo',
        potassium: 'Potássio',
        calcium: 'Cálcio',
        magnesium: 'Magnésio',
        sulfur: 'Enxofre',
        iron: 'Ferro',
        manganese: 'Manganês',
        zinc: 'Zinco',
        copper: 'Cobre',
        boron: 'Boro',
        molybdenum: 'Molibdênio'
    };
    
    Object.keys(soilData.nutrients).forEach(nutrient => {
        if (soilData.nutrients[nutrient] !== null) {
            const score = calculateNutrientScore(nutrient, soilData.nutrients[nutrient]);
            let statusClass = 'nutrient-deficient';
            let statusText = 'Baixo';
            
            if (score >= 80) {
                statusClass = 'nutrient-optimal';
                statusText = 'Ótimo';
            } else if (score >= 60) {
                statusClass = 'nutrient-adequate';
                statusText = 'Bom';
            } else if (score >= 40) {
                statusClass = 'nutrient-low';
                statusText = 'Adequado';
            }
            
            statusHTML += `
                <div class="flex justify-between items-center">
                    <span class="text-sm">${nutrientNames[nutrient]}</span>
                    <div class="flex items-center space-x-2">
                        <div class="w-12 h-2 bg-gray-200 rounded">
                            <div class="h-2 rounded transition-all duration-500 ${statusClass}" style="width: ${score}%"></div>
                        </div>
                        <span class="text-xs text-gray-500">${statusText}</span>
                    </div>
                </div>
            `;
        }
    });
    
    if (statusHTML === '') {
        statusHTML = '<div class="text-sm text-gray-500">Insira valores de nutrientes</div>';
    }
    
    nutrientStatusElement.innerHTML = statusHTML;
}

// Update quick recommendations
function updateQuickRecommendations() {
    const recommendationsElement = document.getElementById('quickRecommendations');
    if (!recommendationsElement) return;
    
    let recommendations = [];
    
    // pH recommendations
    if (soilData.ph !== null) {
        if (soilData.ph < 5.5) {
            recommendations.push('Aplicar calcário para corrigir acidez');
        } else if (soilData.ph > 7.5) {
            recommendations.push('Considerar aplicação de enxofre para reduzir pH');
        }
    }
    
    // Organic matter recommendations
    if (soilData.organicMatter !== null) {
        if (soilData.organicMatter < 2) {
            recommendations.push('Adicionar matéria orgânica (composto ou esterco)');
        }
    }
    
    // Nutrient-specific recommendations
    Object.keys(soilData.nutrients).forEach(nutrient => {
        if (soilData.nutrients[nutrient] !== null) {
            const score = calculateNutrientScore(nutrient, soilData.nutrients[nutrient]);
            if (score < 40) {
                const nutrientNames = {
                    nitrogen: 'nitrogênio',
                    phosphorus: 'fósforo',
                    potassium: 'potássio',
                    calcium: 'cálcio',
                    magnesium: 'magnésio',
                    sulfur: 'enxofre',
                    iron: 'ferro',
                    manganese: 'manganês',
                    zinc: 'zinco',
                    copper: 'cobre',
                    boron: 'boro',
                    molybdenum: 'molibdênio'
                };
                recommendations.push(`Aplicar ${nutrientNames[nutrient]} em deficiência`);
            }
        }
    });
    
    if (recommendations.length === 0) {
        recommendations.push('Seu solo está em boas condições!');
    }
    
    recommendationsElement.innerHTML = recommendations.map(rec => 
        `<div class="text-sm text-gray-600 mb-1">• ${rec}</div>`
    ).join('');
}

// Calculate crop compatibility
function updateCropCompatibility() {
    Object.keys(cropDatabase).forEach(cropKey => {
        const result = computeCropCompatibility(soilData, cropKey);
        cropDatabase[cropKey].compatibility = result.overall;
        cropDatabase[cropKey].compatibilityBreakdown = result;
    });
}

// Compute crop-specific compatibility with detailed breakdown
function computeCropCompatibility(soil, cropKey) {
    const crop = typeof cropKey === 'string' ? cropDatabase[cropKey] : cropKey;
    if (!crop) return { overall: 0, ph: 0, nutrientScores: {} };

    const phWeight = 0.25;
    const nutrientWeight = 1 - phWeight;

    // pH score (0-100)
    let phScore = 0;
    if (soil && (soil.ph !== null && soil.ph !== undefined)) {
        const ph = parseFloat(soil.ph);
        if (isNaN(ph)) {
            phScore = 0;
        } else {
        if (ph >= crop.phRange[0] && ph <= crop.phRange[1]) {
            phScore = 100 - Math.abs(ph - crop.optimalPh) * 20;
        } else {
            const distance = Math.min(Math.abs(ph - crop.phRange[0]), Math.abs(ph - crop.phRange[1]));
            phScore = Math.max(0, 60 - distance * 30);
        }
            phScore = Math.max(0, Math.min(100, Math.round(phScore)));
        }
    }

    // Nutrient scores
    const macroKeys = ['nitrogen','phosphorus','potassium','calcium','magnesium','sulfur'];
    const nutrientScores = {};
    let weightedSum = 0;
    let weightSum = 0;

    Object.keys(crop.nutrients).forEach(nutr => {
        let soilVal = null;
        if (soil && soil.nutrients) {
            soilVal = soil.nutrients[nutr];
            // if nutrients saved as label-keyed objects, try to find by mapping
            if (soilVal === undefined) {
                // try human label keys mapping
                const labelMap = {
                    nitrogen: 'Nitrogênio (N)',
                    phosphorus: 'Fósforo (P)',
                    potassium: 'Potássio (K)',
                    calcium: 'Cálcio (Ca)',
                    magnesium: 'Magnésio (Mg)',
                    sulfur: 'Enxofre (S)',
                    iron: 'Ferro (Fe)',
                    manganese: 'Manganês (Mn)',
                    zinc: 'Zinco (Zn)',
                    copper: 'Cobre (Cu)',
                    boron: 'Boro (B)',
                    molybdenum: 'Molibdênio (Mo)'
                };
                const maybe = soil.nutrients[labelMap[nutr]];
                if (maybe !== undefined) soilVal = maybe && maybe.val !== undefined ? maybe.val : maybe;
            }
        }
        const score = (soilVal !== null && soilVal !== undefined) ? calculateNutrientScore(nutr, soilVal, crop) : 0;
        const weight = macroKeys.includes(nutr) ? 1.5 : 1.0;
        nutrientScores[nutr] = { score: Math.round(score), value: soilVal };
        weightedSum += score * weight;
        weightSum += weight;
    });

    const nutrientAvg = weightSum > 0 ? Math.round(weightedSum / weightSum) : 0;

    const overall = Math.round(phWeight * phScore + nutrientWeight * nutrientAvg);

    return {
        overall,
        ph: phScore,
        nutrientAverage: nutrientAvg,
        nutrientScores
    };
}

// Generate full analysis report
function generateFullReport(showAlert = true, title = null) {
    updateAnalysis();

    const report = createAnalysisReport(title);
    const savedReports = getSavedReports();
    savedReports.push(report);

    localStorage.setItem('soilAnalysisReports', JSON.stringify(savedReports));
    // also store the latest analysis data for other pages to pick up
    localStorage.setItem('soilAnalysisData', JSON.stringify({ soilData: report.soilData, cropCompatibility: report.cropCompatibility }));

    updateSavedReportCount();

    if (showAlert) {
        alert('Relatório salvo com sucesso! Você pode gerar outro ou visualizar os relatórios salvos.');
    }
}

function createAnalysisReport(title = null) {
    const timestamp = new Date().toISOString();
    const formattedTitle = title && title.trim().length > 0 ? title.trim() :
        `Relatório ${new Date().toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`;

    return {
        id: timestamp,
        title: formattedTitle,
        timestamp,
        soilData: JSON.parse(JSON.stringify(soilData)),
        cropCompatibility: JSON.parse(JSON.stringify(cropDatabase))
    };
}

function getSavedReports() {
    return JSON.parse(localStorage.getItem('soilAnalysisReports') || '[]');
}

function saveReport() {
    const title = prompt('Nome do relatório (opcional):');
    generateFullReport(true, title);
}

function saveReportAndRedirect(targetPage) {
    generateFullReport(false);
    if (targetPage && targetPage.includes('relatorio.html')) {
        const sep = targetPage.includes('?') ? '&' : '?';
        window.location.href = `${targetPage}${sep}report=last`;
    } else {
        window.location.href = targetPage;
    }
}

function updateSavedReportCount() {
    const count = getSavedReports().length;
    const countElement = document.getElementById('savedReportCount');
    if (countElement) {
        countElement.textContent = count;
    }
}

function prepareReportAndRedirect(targetPage) {
    saveReportAndRedirect(targetPage);
}

// Export functions for global access
window.updateAnalysis = updateAnalysis;
window.generateFullReport = generateFullReport;
window.prepareReportAndRedirect = saveReportAndRedirect;
window.saveReport = saveReport;
window.computeCropCompatibility = computeCropCompatibility;
window.initializeAnalysis = initializeAnalysis;