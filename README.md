# FreiTagPlaner backend

This is the nodejs backend for a simple Vue3 project as part of our studies. Fetch German holidays according to the federal state via an API and calculate the perfect periods to apply for a vacation.

Have a look [at the frontend repository](https://github.com/navlisData/freitagplaner) for more information

```
https://freitagplaner.de/api?year=2024&state=BW&days=30&startmonth=0&endmonth=11&mindays=7&maxdays=30&correctdates=false&saturdayaswd=false
```


# API Documentation

```
https://freitagplaner.de/api?
```

| Parameter | Description | Value |
| ------ | ------ | ------ |
| year | The year in which you want to search for holidays | Must be in yyyy format. Allowed are years from *1991*
| state | The federal state in which you want to search for public holidays | Must be the abbreviation of one of the German federal states listed below |
| days | The total number of vacation days available | Must be greater than *0* |
| startmonth | The start month of the period in which you want to search for vacation periods | Starting from month *0* (January) to month *11* (December). Must be *smaller* than `endmonth` |
| endmonth | The end month of the period in which you want to search for vacation periods | Starting with month *0* (January) to month *11* (December). Must be *greater* than `startmonth` |
| mindays | The minimum number of vacation days to be used up | Must be *at least as large* as `days` and not *larger* than `maxdays` |
| maxdays | The maximum number of vacation days to be used up | Must be *greater* than `mindays` |
| correctdates | Specify whether to look for days off in the previous or next month of `startmonth` and `endmonth` | Must be either *true* or *false*. Only works if `startmonth` is *greater* than *0* or `endmonth` is *less* than *11* |
| saturdayaswd | Specify whether Saturday should be considered a working day | Must be either *true* or *false* |

----------------
### Allowed abbreviations of the german federal states
```
BW (Baden-Württemberg)
BY (Bayern)
BE (Berlin)
BB (Brandenburg)
HB (Bremen)
HH (Hamburg)
HE (Hessen)
MV (Mecklenburg-Vorpommern)
NI (Niedersachsen)
NW (Nordrhein-Westfalen)
RP (Rheinland-Pfalz)
SL (Saarland)
SN (Sachsen)
ST (Sachsen-Anhalt)
SH (Schleswig-Holstein)
TH (Thüringen)
```

# Algorithm explanation

### 1. API Fetch
The public holiday REST API [Github](https://github.com/bundesAPI/feiertage-api) returns the names, dates and sometimes other information in Json format, taking into account the year and a federal state.
```
https://feiertage-api.de/api/?jahr=2024&nur_land=BW
```
Public holidays that are not in the selected months are directly discarded for further processing in order to reduce data.

----------------
### 2. Period calculation
If you want the system to check whether the preceding and subsequent months end or begin with days off, the start and end dates are extended accordingly.

The entire period is now run through, taking into account the json object, to find out whether the respective days are public holidays, normal weekdays or weekend days.

----------------
### 3. Period creation
The total period is now divided into periods, whereby each period (unless the start or end date selected by the user is not a public holiday or weekend day) begins and ends with a day off and has its working days in between.

The working days and days off are now counted for each of these periods

An example period could look like this
```
13.01.2024 (Saturday)
14.01.2024 (Sunday)
15.01.2024 (Monday)
16.01.2024 (Tuesday)
17.01.2024 (Wednesday)
18.01.2024 (Thursday)
19.01.2024 (Friday)
20.01.2024 (Saturday)
21.01.2024 (Sunday)
```

----------------
### 4. Calculating all combinations
Each period is considered in order and the period(s) before and after it (if any) are appended. This is done using a recursive backtrack algorithm until all possible combinations have been created that lie within the given period of the minimum and maximum number of vacation days.

Assuming we are at period #3, the following periods may be combined:
```
Combination of: [1],[2],[3],[4]
Combination of: [1],[2],[3]
Combination of: [2],[3],[4]
Combination of: [3],[4] (assuming the number of days is not sufficient)
Combination of: [2],[3]
Combination of: [3] (assuming number of days is not sufficient)
```

----------------
### 5. Weigh and optimize periods
Each period (from step #3) now has a list with many possible period combinations. In order to find out which individual period combination is the most valuable for each period, the days off and working days of each of these period combinations are added together.

This is used to create a score for each period combination (of each period), which is calculated from the ratio of days off and working days. The period combination with the highest score wins for the corresponding period.

Assuming we are still at period 3 and WD are working days, NWD are days off and SC is the score
| Period | WD | NWD | SC |
| ------ | ------ | ------ | ------ |
|[1],[2],[3],[4] | WD=18 | NWD=17 | SC=0.94 |
|[1],[2],[3] | WD=13 | NWD=14 | SC=1.08 |
|[2],[3],[4] | WD=15 | NWD=12 | SC=0.8 |
|[2],[3] | WD=7 | NWD=11 | SC=1.57 |

*Then the combination #[2],[3] wins because it has the highest score and the best ratio of days off to working days.*

----------------
### 6. Sort out period combinations
Despite optimization, many periods only have period combinations that consist of several normal weeks. In other words, weeks that begin with two weekend days (Saturday/Sunday), followed by five working days and ending with two weekend days.
Such a pattern can only occur if there are no public holidays around a period (in the past and future). These period combinations are of no further interest and are therefore sorted out.

For this purpose, the mean value and the standard deviation of the score of all period combinations are calculated. A high standard deviation means that the scores are very scattered, while a low standard deviation indicates that they are close to the average.
A threshold value is then defined:
```
Threshold = average score - (0.3 * standard deviation)
```
All period combinations with a score below the threshold are discarded. The remaining periods represent the ideal periods to achieve a long vacation with few working days.

Let's assume we have calculated combinations with the following scores:
```
1) 1.38
2) 2.33
3) 1.75
4) 0.92 (Worse than the threshold)
5) 1.11 (Worse than the threshold)
6) 1.50
9) 1.33
10) 1.11 (Worse than threshold)
11) 1.38
12) 1.17 (Worse than the threshold)
```
Then the threshold value would be: 1.28

----------------
### 7. Merge period combinations
What remains is a list of period entries with the (best) matching period combination. These need to be merged. At this point, a single entry of these period entries (if a corresponding length of days has been selected) usually still consists of several individual periods, which usually begin and end with days off.

In the event that the period combination of the entry actually consists of more than one period, the days off of these also overlap. For this reason, the corresponding days off are removed from the periods at the beginning of the second period.

Let's assume we have the following two periods in our period combination:
| Period #1 | Period #2 | 
| ------ | ------ | 
| 13.01.2024 (Saturday) | 20.01.2024 (Saturday) (Double, removed) |
| 14.01.2024 (Sunday) | 21.01.2024 (Sunday) (Double, removed) |
| 15.01.2024 (Monday) | 22.01.2024 (Monday) |
| 16.01.2024 (Tuesday) | 23.01.2024 (Tuesday) |
| 17.01.2024 (Wednesday) | 24.01.2024 (Wednesday) |
| 18.01.2024 (Thursday) | 25.01.2024 (Thursday) |
| 19.01.2024 (Friday) | 26.01.2024 (Friday) |
| 20.01.2024 (Saturday) | 27.01.2024 (Saturday) |
| 21.01.2024 (Sunday) | 28.01.2024 (Sunday) |

Each individual period combination from the list of period entries is now combined into a final period.
In this way, we end up with a list of periods that generally begin and end with days off again and, if the period length is selected accordingly, include several of the original periods from step #3.

With the period combination from the previous example, the following period results:
```
13.01.2024 (Saturday)
...
28.01.2024 (Sunday)
```
This includes two periods from the list in step #3












