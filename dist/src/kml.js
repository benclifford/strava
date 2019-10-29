"use strict";
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const epdoc_util_1 = require("epdoc-util");
const fs = __importStar(require("fs"));
const util_1 = require("./util");
const dateutil = __importStar(require("dateutil"));
const REGEX = {
    color: /^[a-zA-Z0-9]{8}$/
};
// Colors are aabbggrr
const defaultLineStyles = {
    Default: {
        color: 'C00000FF',
        width: 4
    },
    Ride: {
        color: 'C00000A0',
        width: 4
    },
    Segment: {
        color: 'C0FFFFFF',
        width: 6
    },
    Commute: {
        color: 'C085037D',
        width: 4
    },
    Hike: {
        color: 'F0FF0000',
        width: 4
    },
    Walk: {
        color: 'F0f08000',
        width: 4
    }
};
class Kml {
    constructor(opts = {}) {
        this.verbose = 9;
        this.buffer = '';
        this.detailedActivity = '';
        this.opts = opts;
        this.verbose = opts.verbose;
    }
    get imperial() {
        return this.opts && this.opts.imperial === true;
    }
    get more() {
        return this.opts && this.opts.more === true;
    }
    setLineStyles(styles) {
        Object.keys(styles).forEach(name => {
            const style = styles[name];
            if (style && epdoc_util_1.isString(style.color) && epdoc_util_1.isNumber(style.width) && REGEX.color.test(style.color)) {
                this.lineStyles[name] = style;
            }
            else {
                console.log('Warning: ignoring line style error for %s. Style must be in form \'{ "color": "C03030C0", "width": 2 }\'', name);
            }
        });
    }
    outputData(filepath, activities, segments) {
        let file = filepath || 'Activities.kml';
        return new Promise((resolve, reject) => {
            this.detailedActivity = ''; // new Buffer(8*1024);
            this.stream = fs.createWriteStream(file);
            this.stream.once('open', function (fd) {
                this.header();
                if (this.opts.activities) {
                    this.addActivities(activities);
                }
                if (this.opts.segments) {
                    this.addSegments(segments);
                }
                this.footer();
                this.stream.end();
                console.log('Wrote ' + file);
            });
            this.stream.once('error', err => {
                this.stream.end();
                err.message = 'Stream error ' + err.message;
                reject(err);
            });
            this.stream.once('close', () => {
                console.log('Close ' + file);
                resolve();
            });
            this.stream.on('finish', () => {
                console.log('Finish ' + file);
            });
        });
    }
    addActivities(activities) {
        if (activities && activities.length) {
            let dateString = this._dateString();
            let indent = 2;
            this.writeln(indent, '<Folder><name>Activities' + (dateString ? ' ' + dateString : '') + '</name><open>1</open>');
            return activities
                .reduce((promiseChain, activity) => {
                return promiseChain.then(() => {
                    let job = Promise.resolve().then(() => {
                        this.outputActivity(indent + 1, activity);
                        return this.flush();
                    });
                    return job;
                });
            }, Promise.resolve())
                .then(resp => {
                this.writeln(indent, '</Folder>');
                return this.flush();
            });
        }
        return Promise.resolve();
    }
    _dateString() {
        if (Array.isArray(this.opts.dates)) {
            let ad = [];
            this.opts.dates.forEach(range => {
                ad.push(range.after + ' to ' + range.before);
            });
            return ad.join(', ');
        }
        return '';
    }
    addSegments(segments) {
        if (segments && segments.length) {
            let indent = 2;
            let sortedSegments = segments.sort((a, b) => {
                return util_1.compare(a, b, 'name');
            });
            if (this.opts.segmentsFlatFolder === true) {
                this.outputSegments(indent, sortedSegments);
            }
            else {
                let regions = this.getSegmentRegionList(segments);
                Object.keys(regions).forEach(country => {
                    Object.keys(regions[country]).forEach(state => {
                        this.outputSegments(indent, sortedSegments, country, state);
                    });
                });
                return this.flush();
            }
        }
        return Promise.resolve();
    }
    outputSegments(indent, segments, country, state) {
        let title = 'Segments';
        const dateString = this._dateString();
        if (country && state) {
            title += ' for ' + state + ', ' + country;
        }
        else if (country) {
            title += ' for ' + country;
        }
        this.writeln(indent, '<Folder><name>' + title + '</name><open>1</open>');
        this.writeln(indent + 1, '<description>Efforts for ' + (dateString ? ' ' + dateString : '') + '</description>');
        segments.forEach(segment => {
            if (!country || (country === segment.country && state == segment.state)) {
                this.outputSegment(indent + 2, segment);
            }
        });
        this.writeln(indent, '</Folder>');
    }
    getSegmentRegionList(segments) {
        let regions = {};
        segments.forEach(segment => {
            regions[segment.country] = regions[segment.country] || {};
            if (segment.state) {
                regions[segment.country][segment.state] = true;
            }
        });
        console.log('Segments found in the following regions:\n  ' + JSON.stringify(regions));
        return regions;
    }
    write(indent, s) {
        if (epdoc_util_1.isString(indent)) {
            this.buffer += s;
        }
        else {
            let indent2 = new Array(indent + 1).join('  ');
            this.buffer += indent2 + s;
        }
    }
    writeln(indent, s) {
        if (epdoc_util_1.isString(indent)) {
            this.buffer += s + '\n';
        }
        else {
            let indent2 = new Array(indent + 1).join('  ');
            this.buffer += indent2 + s + '\n';
        }
        //this.buffer.write( indent + s + "\n", 'utf8' );
    }
    flush() {
        if (this.verbose) {
            console.log('  Flushing %d bytes', this.buffer.length);
        }
        return this._flush();
    }
    _flush() {
        let bOk = this.stream.write(this.buffer);
        this.buffer = '';
        if (bOk) {
            return Promise.resolve();
        }
        else {
            if (this.verbose) {
                console.log('  Waiting on drain event');
            }
            this.stream.once('drain', this._flush);
        }
    }
    outputActivity(indent, activity) {
        let t0 = activity.start_date_local.substr(0, 10);
        let styleName = 'Default';
        if (activity.commute && defaultLineStyles['Commute']) {
            styleName = 'Commute';
        }
        else if (defaultLineStyles[activity.type]) {
            styleName = activity.type;
        }
        let params = {
            placemarkId: 'StravaTrack' + ++this.trackIndex,
            name: t0 + ' - ' + util_1.escapeHtml(activity.name),
            description: this._buildActivityDescription(activity),
            styleName: styleName,
            coordinates: activity._coordinates
        };
        this.placemark(indent, params);
    }
    _buildActivityDescription(activity) {
        //console.log(this.opts)
        //console.log(activity.keys)
        if (this.more) {
            let arr = [];
            activity.keys.forEach(field => {
                // console.log(field + ' = ' + activity[field]);
                if (activity[field]) {
                    let key = field;
                    let value = activity[field];
                    if (field === 'distance') {
                        value = util_1.getDistanceString(value, this.imperial);
                    }
                    else if (field === 'moving_time' || field === 'elapsed_time') {
                        value = dateutil.formatMS(activity[field] * 1000, { ms: false, hours: true });
                    }
                    else if (field === 'total_elevation_gain') {
                        key = 'elevation_gain';
                        value = util_1.getElevationString(value, this.imperial);
                    }
                    else if (field === 'average_temp' && typeof value === 'number') {
                        value = util_1.getTemperatureString(value, this.imperial); //  escapeHtml("˚C");
                    }
                    else if (field === '_segments' && activity[field].length) {
                        let segs = [];
                        segs.push('<b>Segments:</b><br><ul>');
                        activity[field].forEach(segment => {
                            let s = '<li><b>' +
                                segment.name +
                                ':</b> ' +
                                dateutil.formatMS(segment.elapsedTime * 1000, { ms: false, hours: true }) +
                                '</li>';
                            segs.push(s);
                        });
                        segs.push('</ul>');
                        arr.push(segs.join('\n'));
                        value = undefined;
                    }
                    else if (field === 'description') {
                        value = value.replace('\n', '<br>');
                    }
                    if (value) {
                        arr.push('<b>' + util_1.fieldCapitalize(key) + ':</b> ' + value);
                    }
                }
            });
            //console.log(arr);
            return '<![CDATA[' + arr.join('<br>\n') + ']]>';
        }
    }
    /**
     * Add one segment to the KML file.
     * @param segment
     * @returns {string}
     */
    outputSegment(indent, segment) {
        let params = {
            placemarkId: 'StravaSegment' + ++this.trackIndex,
            name: util_1.escapeHtml(segment.name),
            description: this.buildSegmentDescription(segment),
            styleName: 'Segment',
            coordinates: segment.coordinates
        };
        this.placemark(indent, params);
    }
    buildSegmentDescription(segment) {
        return '';
    }
    header() {
        this.write(0, '<?xml version="1.0" encoding="UTF-8"?>\n');
        this.write(1, '<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2" xmlns:kml="http://www.opengis.net/kml/2.2" xmlns:atom="http://www.w3.org/2005/Atom">');
        this.write(1, '<Document>\n');
        this.write(2, '<name>Strava Activities</name>\n');
        this.write(2, '<open>1</open>\n');
        Object.keys(this.lineStyles).forEach(name => {
            this._addLineStyle(name, this.lineStyles[name]);
        });
        return this.flush();
    }
    _addLineStyle(name, style) {
        this.write(2, '<Style id="StravaLineStyle' + name + '">\n');
        this.write(3, '<LineStyle><color>' + style.color + '</color><width>' + style.width + '</width></LineStyle>\n');
        this.write(3, '<PolyStyle><color>' + style.color + '</color></PolyStyle>\n');
        this.write(2, '</Style>\n');
    }
    footer() {
        this.write(1, '</Document>\n</kml>\n');
        return this.flush();
    }
    placemark(indent, params) {
        this.writeln(indent, '<Placemark id="' + params.placemarkId + '">');
        this.writeln(indent + 1, '<name>' + params.name + '</name>');
        if (params.description) {
            this.writeln(indent + 1, '<description>' + params.description + '</description>');
        }
        this.writeln(indent + 1, '<visibility>1</visibility>');
        this.writeln(indent + 1, '<styleUrl>#StravaLineStyle' + params.styleName + '</styleUrl>');
        this.writeln(indent + 1, '<LineString>');
        this.writeln(indent + 2, '<tessellate>1</tessellate>');
        if (params.coordinates && params.coordinates.length) {
            this.writeln(indent + 2, '<coordinates>');
            params.coordinates.forEach(coord => {
                this.write(0, '' + [coord[1], coord[0], 0].join(',') + ' ');
            });
            this.writeln(indent + 2, '</coordinates>');
        }
        this.writeln(indent + 1, '</LineString>');
        this.writeln(indent, '</Placemark>');
    }
}
exports.Kml = Kml;
//# sourceMappingURL=kml.js.map