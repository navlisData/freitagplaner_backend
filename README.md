# FreiTagPlaner backend

This is the nodejs backend for a simple Vue3 project as part of our studies. Fetch German holidays according to the federal state via an API and calculate the perfect periods to apply for a vacation.

Have a look [at the frontend repository](https://github.com/navlisData/freitagplaner) for more information

```
https://freitagplaner.de/api?year=2024&state=BW&days=30&startmonth=0&endmonth=11&mindays=7&maxdays=30&correctdates=false&saturdayaswd=false
```


## API Documentation

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

