// Use the express module for the server
const express = require('express');
const server = express();
const port = 8081;

const cors = require('cors');
const { getOptimizedPeriods } = require("./optimization");

server.use(cors());
/*
const corsOptions = {
    origin: 'http://localhost:5173', //Allow only for specific services
    optionsSuccessStatus: 200 // For some older browser
};
 */


function generateProfileByParameter(query) {
    if ((query.year) &&
        (query.state) &&
        (query.days) &&
        (query.startmonth || query.startmonth === 0) &&
        (query.endmonth || query.endmonth === 0) &&
        (query.mindays) &&
        (query.maxdays) &&
        query.correctdates && (query.correctdates === 'true' || query.correctdates === 'false') &&
        query.saturdayaswd && (query.saturdayaswd === 'true' || query.saturdayaswd === 'false'))
    {

        const calculateProfile = {
            year: parseInt(query.year),
            state: query.state,
            days: parseInt(query.days),
            startMonth: parseInt(query.startmonth),
            endMonth: parseInt(query.endmonth),
            minDays: parseInt(query.mindays),
            maxDays: parseInt(query.maxdays),
            correctDates: query.correctdates === 'true' ? true : false,
            saturdayAsWd: query.saturdayaswd === 'true' ? true : false
        };

        const validStates = ['BW', 'BY', 'BE', 'BB', 'HB', 'HH', 'HE', 'MV', 'NI', 'NW', 'RP', 'SL', 'SN', 'ST', 'SH', 'TH'];
        if(!isNaN(calculateProfile.year) && calculateProfile.year >= 1900 && !isNaN(calculateProfile.days) && !isNaN(calculateProfile.startMonth) &&
            !isNaN(calculateProfile.endMonth) && !isNaN(calculateProfile.minDays) && !isNaN(calculateProfile.maxDays) &&
            typeof calculateProfile.state === 'string' && validStates.includes(calculateProfile.state.toUpperCase()))
        {
            if(calculateProfile.days < 0) return null;
            if(calculateProfile.startMonth < 0 || calculateProfile.startMonth >= calculateProfile.endMonth) return null;
            if(calculateProfile.endMonth > 11 || calculateProfile.endMonth <= calculateProfile.startMonth) return null;
            if(calculateProfile.minDays < 1 || calculateProfile.minDays >= calculateProfile.maxDays) return null;
            if(calculateProfile.maxDays <= calculateProfile.minDays || calculateProfile.maxDays > calculateProfile.days) return null;

            return calculateProfile;
        }
    }
    return null;
}

server.get('/api', (req, res) => {
    if(Object.keys(req.query).length === 9) {
        const calculationProfile = generateProfileByParameter(req.query);
        if(calculationProfile) {
            getOptimizedPeriods(calculationProfile).then(data => {
                if(data) {
                    res.json(data);
                } else {
                    res.status(400).send('Error with the feiertage-api. Please check https://feiertage-api.de for more information');
                }
            });
        } else {
            res.status(400).send('Query parameters dont match required conditions. View API documentation for more information: https://freitagplaner.de/api-documentation');
        }
    } else {
        res.status(400).send('Invalid amount of parameters, nine are needed. View API documentation for more information: https://freitagplaner.de/api-documentation');
    }
})

// Set the server to listen on the configured port
server.listen(port, ()=> {
    console.log(`Server listening on port ${port}`);
});

