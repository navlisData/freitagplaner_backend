const {get} = require("axios");
const WEEKEND = 'Wochenende';
const HOLIDAY = 'Feiertag';
const WORKINGDAY = 'Arbeitstag';

module.exports = { getOptimizedPeriods };

async function fetchApi(year, state) {
    try {
        const response = await get("https://feiertage-api.de/api/?jahr=" + year + "&nur_land=" + state);
        if(response.status === 200) {
            return response.data;
        } else {
            throw new Error('Network response was not ok.');
        }
    } catch (error) {
        console.error("Failed to fetch holidays:", error);
    }
}

async function getOptimizedPeriods(calculatorProfile) {
    const rawApiData = await fetchApi(calculatorProfile.year, calculatorProfile.state);

    if(!rawApiData) return null;

    const excludedJsonData = removeExcludedMonths(rawApiData, //reduce json data but substract and add one month for correcting dates
        (calculatorProfile.startMonth === 0 ? 0 : calculatorProfile.startMonth-1),
        (calculatorProfile.endMonth === 11 ? 11 : calculatorProfile.endMonth+1));

    let startDate = new Date(calculatorProfile.year, calculatorProfile.startMonth, 1, 0,0,0);
    let endDate = new Date(calculatorProfile.year, calculatorProfile.endMonth, getLastDayOfMonth(calculatorProfile.year, calculatorProfile.endMonth), 0,0,0);

    if(calculatorProfile.correctDates) {
        startDate = new Date(correctDate(excludedJsonData, startDate, false));
        endDate = new Date(correctDate(excludedJsonData, endDate, true));
    }

    const dayArray = createDayArray(startDate, endDate, calculatorProfile.saturdayAsWd, excludedJsonData); //Creates an array with all needed days
    const splittedPeriods = splitIntoPeriods(dayArray); //Split the array into periods where all periods starts and ends with non working days
    const preparedPeriods = preparePeriodScore(splittedPeriods); //Count working and nonworking days in every period
    //Find all period-combinations in given min/max-days and find best scored option
    let optimizedCombinations = optimizeCombinations(preparedPeriods, calculatorProfile.minDays, calculatorProfile.maxDays);

    console.log("Removing combinations. Now: ", optimizedCombinations.length + " items.")
    optimizedCombinations = filterByStandardDeviation(optimizedCombinations); //Remove periods depending on a certain threshold of score
    console.log("After removing: ", optimizedCombinations.length + " items.")

    return mergePeriods(optimizedCombinations, preparedPeriods); //Merge optimized periods together and remove duplicated nonworkingdays
}

//Due to the merging multiple periods, some days are duplicated and are needed to removed
function mergePeriods(optimizedCombinations, preparedPeriods) {
    let combinedPeriods = {} //Json object

    for(let i = 0; i < optimizedCombinations.length; i++) { //for all combinations
        const periodPieces = optimizedCombinations[i].bestScoredPeriodPieces; //which can consist of several periods
        let periodBuilder = [];
        let removedNonworkingdays = 0;
        for(let j = 0; j < periodPieces.length; j++) { //for each period-piece
            const singlePeriodPiece = preparedPeriods[periodPieces[j]].period;
            if(j === 0) {
                if(periodPieces === 1) {
                    const periodMetadata = {
                        period: periodBuilder, score: optimizedCombinations[i].score,
                        nonworkingdays: optimizedCombinations[i].nonworkingdays, workingdays: optimizedCombinations[i].workingdays
                    }
                    combinedPeriods[i] = periodMetadata;
                } else {
                    periodBuilder = periodBuilder.concat(singlePeriodPiece)
                }
            } else {
                //Remove duplicated nonworkingdays in the beginning of every period, starting at index of 1
                let periodCopy = singlePeriodPiece.slice();
                let index = 0;
                while(singlePeriodPiece[index] && singlePeriodPiece[index].daytype !== WORKINGDAY) {
                    periodCopy.shift();
                    index++;
                }
                removedNonworkingdays += index; //Track how many nonworkingdays were removed for substracting of the period-nonworking-days
                periodBuilder = periodBuilder.concat(periodCopy);
            }
        }
        if (periodBuilder.length > 0) {
            let correctedScore = 0;
            if(optimizedCombinations[i].nonworkingdays - removedNonworkingdays !== 0) {
                correctedScore = (optimizedCombinations[i].nonworkingdays - removedNonworkingdays) / optimizedCombinations[i].workingdays;
            }
            const periodMetadata = {
                period: periodBuilder, score:  correctedScore,
                nonworkingdays: (optimizedCombinations[i].nonworkingdays - removedNonworkingdays), workingdays: optimizedCombinations[i].workingdays
            }
            combinedPeriods[i] = periodMetadata;
            periodBuilder = [];
        }
    }

    return combinedPeriods;
}

function optimizeCombinations(preparedPeriods, minDays, maxDays) {

    //For every single period, build best merged period in range of min/max-days
    function optimizeAndScorePeriods() {
        let bestCombinations = [];
        for(let i = 0; i < preparedPeriods.length; i++) {
            const combinationsByIndex = cleanOutCombinations(findAllPeriodCombinations(preparedPeriods, i, minDays, maxDays));
            let bestScore = 0;
            let bestPeriod = []
            let workingdays = 0;
            let nonworkingdays = 0;
            for(let j = 0; j < combinationsByIndex.length; j++) {
                if(addedByOtherPeriod(combinationsByIndex[j])) continue;
                //Sum day-types of all merged "single-periods" for combination 'j'
                const { totalWorkingDays, totalNonWorkingDays } = combinationsByIndex[j].reduce((acc, index) => {
                    return {
                        totalWorkingDays: acc.totalWorkingDays + preparedPeriods[index].workingdays,
                        totalNonWorkingDays: acc.totalNonWorkingDays + preparedPeriods[index].nonworkingdays
                    };
                }, { totalWorkingDays: 0, totalNonWorkingDays: 0 });

                let score = totalNonWorkingDays !== 0 ? totalNonWorkingDays / totalWorkingDays : 0;
                if(score > bestScore) {
                    bestScore = score;
                    bestPeriod = combinationsByIndex[j];
                    workingdays = totalWorkingDays;
                    nonworkingdays = totalNonWorkingDays;
                }
            }
            const bestCombination = {
                bestScoredPeriodPieces: bestPeriod,
                workingdays: workingdays,
                nonworkingdays: nonworkingdays,
                score: bestScore
            }
            bestCombinations.push(bestCombination)
        }
        return bestCombinations;
    }

    let alreadySeen = new Set();
    function addedByOtherPeriod(combinationByIndex) {
        const sizeBefore = alreadySeen.size;
        alreadySeen.add(JSON.stringify(combinationByIndex));
        return alreadySeen.size === sizeBefore;
    }

    //Combinations may be built in various order due the backtrack algorithm, although they combine the same period-time
    function cleanOutCombinations(combinationsByIndex) {
        let uniqueSet = new Set();
        combinationsByIndex.forEach(arr => {
            let sortedArr = arr.sort((a, b) => a - b);
            uniqueSet.add(JSON.stringify(sortedArr));
        });
        return Array.from(uniqueSet).map(str => JSON.parse(str));
    }

    //Backtrack algorithm, merge every period with every possible nearby period in day-range of min/max-days
    function findAllPeriodCombinations(periods, startPeriodIndex, minDays, maxDays) {
        let allCombinations = [];

        function backtrack(combination, currentWdDayCount, index) {
            if (currentWdDayCount <= maxDays) { // Check if the period has a less or equal count of days than given
                if (currentWdDayCount >= minDays) {
                    allCombinations.push(combination.slice()); // save valid combination as soon min-days is reached
                }

                // step one index back and forth
                [-1, 1].forEach(direction => {
                    let nextIndex = index + direction;
                    if (nextIndex >= 0 && nextIndex < periods.length && !combination.includes(nextIndex)) {
                        combination.push(nextIndex);
                        backtrack(combination, currentWdDayCount + cleanPeriodCount(index, nextIndex), nextIndex);
                        combination.pop(); // reset for the next iteration
                    }
                });
            }
        }

        //Filters the nextPeriod, removes the days of the current period and returns the filtered length of the next period (
        function cleanPeriodCount(currPeriodIndex, nextPeriodIndex) {
            // return periods[nextPeriodIndex].period.filter(np => !periods[currPeriodIndex].period.includes(np)).length;
            return periods[nextPeriodIndex].period.filter(day => !periods[currPeriodIndex].period.includes(day)).filter(day => day.daytype === WORKINGDAY).length;
        }

        backtrack([startPeriodIndex], periods[startPeriodIndex].period.filter(day => day.daytype === WORKINGDAY).length, startPeriodIndex);
        return allCombinations;
    }

    return optimizeAndScorePeriods();
}

//with help of CGPT
function filterByStandardDeviation(bestCombinations) {
    // Extract scores from the best combinations
    const scores = bestCombinations.map(bestCombination => bestCombination.score);
    const mean = scores.reduce((acc, val) => acc + val, 0) / scores.length; //calc average of score
    const stdDev = Math.sqrt( //clac standard deviation (stdDev) of score
        scores.map(score => Math.pow(score - mean, 2)).reduce((acc, val) => acc + val, 0) / scores.length
    );
    const threshold = mean - 0.3 * stdDev;
    return bestCombinations.filter(bestCombination => bestCombination.score > threshold);
}

function getLastDayOfMonth(year, month) {
    return new Date(year, month + 1, 0).getDate();
}

//Checks on a specific date, if the next or previous days are non-working days > if so, add them
function correctDate(rawJsonData, initDate, calculateForward) {
    let correctedDate = new Date(initDate);
    let dateToCheck = new Date(correctedDate);
    dateToCheck.setDate(correctedDate.getDate() + (calculateForward ? +1 : -1));

    while((dateToCheck.getDay() === 0 || dateToCheck.getDay() === 6 || getMatchingHolidayname(rawJsonData, new Date(dateToCheck))) && (dateToCheck.getFullYear() === initDate.getFullYear())) {
        correctedDate = new Date(dateToCheck);
        dateToCheck.setDate(correctedDate.getDate() + (calculateForward ? +1 : -1));
    }
    return correctedDate;
}

function createDayArray(startDate, endDate, saturdayAsWd, excludedJsonData) {
    function createArray() {
        let dayArray = [];
        const dayCount = getDayCount(startDate, endDate);

        for(let currDay = 0; currDay < dayCount; currDay++) {
            let currentDate = new Date(startDate);
            currentDate.setDate(currentDate.getDate()+currDay);

            let daytype = null;
            const holidayMatch = getMatchingHolidayname(excludedJsonData, new Date(currentDate));
            if(holidayMatch) {
                daytype = HOLIDAY;
            } else if(currentDate.getDay() === 0 || (currentDate.getDay() === 6 && !saturdayAsWd)) {
                daytype = WEEKEND;
            } else {
                daytype = WORKINGDAY;
            }

            let dayEntry = {
                daytype: daytype,
                date: currentDate,
                holidayname: holidayMatch
            }

            dayArray.push(dayEntry);
        }
        return dayArray;
    }

    function getDayCount(startDate, endDate) {
        const start = new Date(startDate);
        const end = new Date(endDate);

        // Calculate the difference in milliseconds and convert to days
        let dayCount = (end - start) / (1000 * 60 * 60 * 24);
        return dayCount+1; //include the end date as a full day
    }

    return createArray();
}

function splitIntoPeriods(dayEntries) {
    function createSplittedPeriods() {
        let alreadyFoundWorkingday = false; //For the case, that dayEntries starts with a non-working day
        let periods = [];

        let currentPeriod = [];

        for (let i = 0; i < dayEntries.length; i++) {
            let entry = dayEntries[i];
            currentPeriod.push(entry);

            if (entry.daytype !== WORKINGDAY) {
                // AND it was the last dayEntry in the array OR the next dayEntry exists and is a WORKINGDAY
                // and a workingday was already found
                if(i === dayEntries.length - 1 || (dayEntries[i + 1] && dayEntries[i + 1].daytype === WORKINGDAY) && alreadyFoundWorkingday === true) {
                    if(periods.length>0) {
                        fillWithPreviousDays(periods, currentPeriod)
                    }

                    // save the currentPeriod and start a new one by resetting currentPeriod
                    periods.push(currentPeriod);
                    currentPeriod = [];
                }
            } else {
                alreadyFoundWorkingday = true;
            }
        }

        // add the last period, even if the last dayEntries-Array is a WORKINGDAY
        if (currentPeriod.length > 0) {
            if(periods.length>0) {
                fillWithPreviousDays(periods, currentPeriod)
            }
            periods.push(currentPeriod);
        }

        return periods;
    }

    //add non-working days at end of the previous period to the start of the currentPeriod
    function fillWithPreviousDays(periods, currentPeriod) {
        const prevPeriod = periods[periods.length-1];
        for(let i = prevPeriod.length; i > 0; i--) {
            const lastEntryInLastPeriod = prevPeriod[i-1];
            if(lastEntryInLastPeriod.daytype !== WORKINGDAY) {
                currentPeriod.unshift(lastEntryInLastPeriod);
            } else {
                return;
            }
        }
    }

    return createSplittedPeriods();
}

function preparePeriodScore(periodArray) {
    let preparedPeriods = [];

    let scoredPeriod = {
        period: [],
        workingdays: 0,
        nonworkingdays: 0
    }

    for(let i = 0; i < periodArray.length; i++) {
        let workingdays = 0;
        let nonworkingdays = 0;
        for(let j = 0; j < periodArray[i].length; j++) {
            if(periodArray[i][j].daytype === WORKINGDAY) {
                workingdays++;
            } else {
                nonworkingdays++;
            }
        }

        scoredPeriod.period = periodArray[i];
        scoredPeriod.workingdays = workingdays;
        scoredPeriod.nonworkingdays = nonworkingdays;
        preparedPeriods.push(scoredPeriod);

        scoredPeriod = {
            period: [],
            workingdays: 0,
            nonworkingdays: 0
        }
    }
    return preparedPeriods;
}

//Checks, if the passed 'dateToCheck' is a holiday and returns the name if so
function getMatchingHolidayname(jsonData, dateToCheck) {
    for (const holidayName of Object.keys(jsonData)) {
        const holiday = jsonData[holidayName];
        const holidayDate = new Date(holiday.datum);

        if (holidayDate.getDate() === dateToCheck.getDate() && (holidayDate.getMonth() === dateToCheck.getMonth())) {
            return holidayName;
        }
    }
    return null;
}

//Reduce amount of json data for faster calculation
function removeExcludedMonths(jsonData, startMonth, endMonth) {
    let filteredHolidays = {};
    Object.keys(jsonData).forEach(holidayName => {
        const holiday = jsonData[holidayName];
        const month = new Date(holiday.datum).getMonth();
        if (startMonth <= month && endMonth >= month) {
            filteredHolidays[holidayName] = holiday;
        }
    });
    return filteredHolidays;
}

