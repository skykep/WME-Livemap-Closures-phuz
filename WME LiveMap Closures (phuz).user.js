// ==UserScript==
// @name				WME LiveMap Closures (phuz)
// @description 		Shows road closures (and comments) from Waze Live map in WME
// @include 			https://www.waze.com/editor*
// @include 			https://www.waze.com/*/editor*
// @include 			https://beta.waze.com/*
// @exclude				https://www.waze.com/*user/editor*
// @version 			1.16.7
// @copyright			2014-2022, pvo11
// @namespace			https://greasyfork.org/scripts/5144-wme-road-closures
// @require             https://cdnjs.cloudflare.com/ajax/libs/moment.js/2.29.1/moment.min.js
// @grant               GM_info
// @grant               GM_addStyle

// ==/UserScript==
/* global OpenLayers */
/* global W */
/* global I18n */

let rtcCommentLayer;
let myCSS = `#rtcCommentContainer {
position: absolute;
padding: 4em;
background: lightgray;
border: 1px double black;
border-radius: 1ex;
z-index: 777;
display: block;
}

table.rtcCommentTable td {
    padding: 2px;
}

#mydivheader {
cursor: move;
z-index: 777;
position: sticky;
background-color: #2f2f2f;
color: #FFFFFF;
}

.modalclose {
background: lightgray;
z-index: 800;
color: #FFFFFF;
line-height: 25px;
position: absolute;
right: -12px;
text-align: center;
top: -10px;
width: 24px;
text-decoration: none;
font-weight: bold;
-webkit-border-radius: 12px;
-moz-border-radius: 12px;
border-radius: 12px;
-moz-box-shadow: 1px 1px 3px #000;
-webkit-box-shadow: 1px 1px 3px #000;
box-shadow: 1px 1px 3px #000;
}

.modalclose:hover {
background: #00d9ff;
text-decoration: none;
}

hr.myhrline{
margin: 5px;
}
`

var epsg900913;
var epsg4326;
var closuresLayer;

var uOpenLayers;
var uWaze;

var lineWidth = [
    [4, 5],
    [5, 6],
    [6, 7],
    [7, 8],
    [8, 9],
    [10, 12],
    [12, 14],
    [14, 16],
    [15, 17],
    [16, 18],
    [17, 19]
];


function drawLine(line) {
    var linePoints = [];

    var zoom = uWaze.map.getZoom() - 12;
    if (zoom >= lineWidth.length) {
        zoom = lineWidth.length - 1;
    }

    var p = new uOpenLayers.Geometry.Point(line[0].x, line[0].y).transform(epsg4326, epsg900913);
    linePoints.push(p);
    for (var i = 1; i < line.length - 1; i++) {
        var lp1 = line[i];
        var lp2 = line[i + 1];

        var dif_lon = Math.abs(lp1.x - lp2.x);
        var dif_lat = Math.abs(lp1.y - lp2.y);

        if (dif_lon < 0.0000001 && dif_lat < 0.0000001) continue;
        p = new uOpenLayers.Geometry.Point(lp1.x, lp1.y).transform(epsg4326, epsg900913);
        linePoints.push(p);
    }
    p = new uOpenLayers.Geometry.Point(line[line.length - 1].x, line[line.length - 1].y).transform(epsg4326, epsg900913);
    linePoints.push(p);
    var lineString = new uOpenLayers.Geometry.LineString(linePoints);
    var lineFeature = new uOpenLayers.Feature.Vector(lineString, null, { strokeColor: '#000000', strokeDashstyle: 'solid', strokeLinecap: 'round', strokeWidth: lineWidth[zoom][1] });
    closuresLayer.addFeatures(lineFeature);
    lineString = new uOpenLayers.Geometry.LineString(linePoints);
    lineFeature = new uOpenLayers.Feature.Vector(lineString, null, { strokeColor: '#FF0000', strokeDashstyle: 'solid', strokeLinecap: 'round', strokeWidth: lineWidth[zoom][0] });
    closuresLayer.addFeatures(lineFeature);
    lineString = new uOpenLayers.Geometry.LineString(linePoints);
    lineFeature = new uOpenLayers.Feature.Vector(lineString, null, { strokeColor: '#FFFFFF', strokeDashstyle: 'dot', strokeLinecap: 'square', strokeWidth: lineWidth[zoom][0] });
    closuresLayer.addFeatures(lineFeature);
}


function getRoutingURL() {
    var server;
    if (typeof (uWaze.location) === 'undefined') {
        server = uWaze.app.getAppRegionCode();
    } else {
        server = uWaze.location.code;
    }
    var routingURL = 'https://www.waze.com';
    if (~document.URL.indexOf('https://beta.waze.com')) {
        routingURL = 'https://beta.waze.com';
    }

    switch (server) {
        case 'usa':
            routingURL += '/rtserver/web/TGeoRSS';
            break;
        case 'row':
            routingURL += '/row-rtserver/web/TGeoRSS';
            break;
        case 'il':
            routingURL += '/il-rtserver/web/TGeoRSS';
            break;
        default:
            routingURL += '/rtserver/web/TGeoRSS';
    }

    return routingURL;
}


function requestClosures() {
    var zoom = uWaze.map.getZoom() - 12;
    if (zoom >= 0) {
        if (closuresLayer.getVisibility()) {
            var extent = uWaze.map.getExtent();
            var oh = 500;
            var pLB = new uOpenLayers.Geometry.Point(extent.left - oh, extent.bottom - oh).transform(epsg900913, epsg4326);
            var pRT = new uOpenLayers.Geometry.Point(extent.right + oh, extent.top + oh).transform(epsg900913, epsg4326);
            var data = {
                ma: "600",
                mj: "100",
                mu: "100",
                types: "traffic,alerts",
                left: pLB.x,
                right: pRT.x,
                bottom: pLB.y,
                top: pRT.y
            };
            var url = getRoutingURL();

            $.ajax({
                dataType: "json",
                url: url,
                data: data,
                success: function (json) {
                    if (json.error != undefined) {
                    } else {
                        if (W.map.getLayersByName('rtcCommentLayer').length == 1) {
                            W.map.removeLayer(rtcCommentLayer);
                        }
                        closuresLayer.destroyFeatures();
                        rtcCommentLayer = new OpenLayers.Layer.Markers('rtcCommentLayer');
                        W.map.addLayer(rtcCommentLayer);
                        var ids = [];
                        if ("undefined" !== typeof (json.jams)) {
                            var numjams = json.jams.length;
                            var numAlerts = json.alerts.length;
                            for (var i = 0; i < numjams; i++) {
                                var jam = json.jams[i];
                                if (jam.delay === -1) {
                                    drawLine(jam.line);
                                    for (var j = 0; j < numAlerts; j++) {
                                        var alerts = json.alerts[j];
                                        if (alerts.uuid == jam.blockingAlertUuid) {
                                            if (alerts.comments) {
                                                let hasText = false;
                                                let comment = [], timestamp = [];
                                                for (var k = 0; k < alerts.comments.length; k++) {
                                                    if (alerts.comments[k].isThumbsUp == false) {
                                                        comment.push(alerts.comments[k].text);
                                                        timestamp.push(alerts.comments[k].reportMillis);
                                                        hasText = true;
                                                        //build the comment history
                                                    }
                                                }
                                                if (hasText) {
                                                    let x = jam.line[Math.trunc(jam.line.length / 2)].x;
                                                    let y = jam.line[Math.trunc(jam.line.length / 2)].y;
                                                    drawCommentMarker(alerts.reportDescription, comment, timestamp, x, y);
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            });
        }
    }
}


function changeLayer() {
    localStorage.DrawLiveMapClosures = closuresLayer.getVisibility();
    requestClosures();
}


function liveMapClosures_init() {
    closuresLayer = new uOpenLayers.Layer.Vector("LiveMap closures", {
        displayInLayerSwitcher: true,
        uniqueName: "__DrawLiveMapClosures"
    });
    uWaze.map.addLayer(closuresLayer);
    if (localStorage.DrawLiveMapClosures) {
        closuresLayer.setVisibility(localStorage.DrawLiveMapClosures == "true");
    } else {
        closuresLayer.setVisibility(true);
    }
    var roadGroupSelector = document.getElementById('layer-switcher-group_road');
    if (roadGroupSelector != null) {
        var roadGroup = roadGroupSelector.parentNode.parentNode.getElementsByTagName("UL")[0];
        var toggler = document.createElement('li');
        var checkbox = document.createElement("wz-checkbox");
        checkbox.id = 'layer-switcher-item_livemap_closures';
        checkbox.className = "hydrated";
        checkbox.disabled = !roadGroupSelector.checked;
        checkbox.checked = closuresLayer.getVisibility();
        checkbox.appendChild(document.createTextNode("LiveMap closures"));
        toggler.appendChild(checkbox);
        roadGroup.appendChild(toggler);
        checkbox.addEventListener('click', function (e) {
            closuresLayer.setVisibility(e.target.checked);
        });
        roadGroupSelector.addEventListener('click', function (e) {
            closuresLayer.setVisibility(e.target.checked && checkbox.checked);
            checkbox.disabled = !e.target.checked;
        });
    }

    var alertsLayer = uWaze.map.getLayerByUniqueName('__livemap_alerts');
    if (typeof (alertsLayer) !== "undefined") {
        var closuresLayerZIdx = closuresLayer.getZIndex();
        var alertsLayerZIdx = alertsLayer.getZIndex();
        if (closuresLayerZIdx > alertsLayerZIdx) {
            closuresLayer.setZIndex(alertsLayerZIdx);
            alertsLayer.setZIndex(closuresLayerZIdx);
        }
    }

    uWaze.map.events.register("zoomend", null, requestClosures);
    uWaze.map.events.register("moveend", null, requestClosures);
    uWaze.map.events.register("changelayer", null, changeLayer);
    requestClosures();

}

function liveMapClosures_bootstrap() {
    uWaze = unsafeWindow.W;
    uOpenLayers = unsafeWindow.OpenLayers;

    if (typeof (uOpenLayers) === 'undefined' || typeof (uWaze) === 'undefined' || typeof (uWaze.map) === 'undefined' || document.querySelector('.list-unstyled.togglers .group') === null) {
        setTimeout(liveMapClosures_bootstrap, 500);
    } else {
        epsg900913 = new uOpenLayers.Projection("EPSG:900913");
        epsg4326 = new uOpenLayers.Projection("EPSG:4326");
        if (!OpenLayers.Icon) {
            installIcon();
        }
        GM_addStyle(myCSS);
        liveMapClosures_init();
    }
}

//Generate the Advisory markers
function drawCommentMarker(title, comments, datetime, x, y) {
    var commentIcon = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAACXBIWXMAAA7EAAAOxAGVKw4bAAA53mlUWHRYTUw6Y29tLmFkb2JlLnhtcAAAAAAAPD94cGFja2V0IGJlZ2luPSLvu78iIGlkPSJXNU0wTXBDZWhpSHpyZVN6TlRjemtjOWQiPz4KPHg6eG1wbWV0YSB4bWxuczp4PSJhZG9iZTpuczptZXRhLyIgeDp4bXB0az0iQWRvYmUgWE1QIENvcmUgNS42LWMwNjcgNzkuMTU3NzQ3LCAyMDE1LzAzLzMwLTIzOjQwOjQyICAgICAgICAiPgogICA8cmRmOlJERiB4bWxuczpyZGY9Imh0dHA6Ly93d3cudzMub3JnLzE5OTkvMDIvMjItcmRmLXN5bnRheC1ucyMiPgogICAgICA8cmRmOkRlc2NyaXB0aW9uIHJkZjphYm91dD0iIgogICAgICAgICAgICB4bWxuczp4bXA9Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC8iCiAgICAgICAgICAgIHhtbG5zOmRjPSJodHRwOi8vcHVybC5vcmcvZGMvZWxlbWVudHMvMS4xLyIKICAgICAgICAgICAgeG1sbnM6cGhvdG9zaG9wPSJodHRwOi8vbnMuYWRvYmUuY29tL3Bob3Rvc2hvcC8xLjAvIgogICAgICAgICAgICB4bWxuczp4bXBNTT0iaHR0cDovL25zLmFkb2JlLmNvbS94YXAvMS4wL21tLyIKICAgICAgICAgICAgeG1sbnM6c3RFdnQ9Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC9zVHlwZS9SZXNvdXJjZUV2ZW50IyIKICAgICAgICAgICAgeG1sbnM6dGlmZj0iaHR0cDovL25zLmFkb2JlLmNvbS90aWZmLzEuMC8iCiAgICAgICAgICAgIHhtbG5zOmV4aWY9Imh0dHA6Ly9ucy5hZG9iZS5jb20vZXhpZi8xLjAvIj4KICAgICAgICAgPHhtcDpDcmVhdG9yVG9vbD5BZG9iZSBQaG90b3Nob3AgQ0MgMjAxNSAoV2luZG93cyk8L3htcDpDcmVhdG9yVG9vbD4KICAgICAgICAgPHhtcDpDcmVhdGVEYXRlPjIwMjMtMDEtMDdUMTk6NTg6MzMtMDU6MDA8L3htcDpDcmVhdGVEYXRlPgogICAgICAgICA8eG1wOk1vZGlmeURhdGU+MjAyMy0wMS0wN1QyMTo1MzoyOS0wNTowMDwveG1wOk1vZGlmeURhdGU+CiAgICAgICAgIDx4bXA6TWV0YWRhdGFEYXRlPjIwMjMtMDEtMDdUMjE6NTM6MjktMDU6MDA8L3htcDpNZXRhZGF0YURhdGU+CiAgICAgICAgIDxkYzpmb3JtYXQ+aW1hZ2UvcG5nPC9kYzpmb3JtYXQ+CiAgICAgICAgIDxwaG90b3Nob3A6Q29sb3JNb2RlPjM8L3Bob3Rvc2hvcDpDb2xvck1vZGU+CiAgICAgICAgIDx4bXBNTTpJbnN0YW5jZUlEPnhtcC5paWQ6ZmY1NDIzMTMtNTkwOS1hNTQ0LWJmMTMtZDNmMGVmOWM5NWJkPC94bXBNTTpJbnN0YW5jZUlEPgogICAgICAgICA8eG1wTU06RG9jdW1lbnRJRD54bXAuZGlkOjYyNDEwMTIzLWExY2EtNmM0NC1hNjdkLWMxMDNlYzYwMzgyNTwveG1wTU06RG9jdW1lbnRJRD4KICAgICAgICAgPHhtcE1NOk9yaWdpbmFsRG9jdW1lbnRJRD54bXAuZGlkOjYyNDEwMTIzLWExY2EtNmM0NC1hNjdkLWMxMDNlYzYwMzgyNTwveG1wTU06T3JpZ2luYWxEb2N1bWVudElEPgogICAgICAgICA8eG1wTU06SGlzdG9yeT4KICAgICAgICAgICAgPHJkZjpTZXE+CiAgICAgICAgICAgICAgIDxyZGY6bGkgcmRmOnBhcnNlVHlwZT0iUmVzb3VyY2UiPgogICAgICAgICAgICAgICAgICA8c3RFdnQ6YWN0aW9uPmNyZWF0ZWQ8L3N0RXZ0OmFjdGlvbj4KICAgICAgICAgICAgICAgICAgPHN0RXZ0Omluc3RhbmNlSUQ+eG1wLmlpZDo2MjQxMDEyMy1hMWNhLTZjNDQtYTY3ZC1jMTAzZWM2MDM4MjU8L3N0RXZ0Omluc3RhbmNlSUQ+CiAgICAgICAgICAgICAgICAgIDxzdEV2dDp3aGVuPjIwMjMtMDEtMDdUMTk6NTg6MzMtMDU6MDA8L3N0RXZ0OndoZW4+CiAgICAgICAgICAgICAgICAgIDxzdEV2dDpzb2Z0d2FyZUFnZW50PkFkb2JlIFBob3Rvc2hvcCBDQyAyMDE1IChXaW5kb3dzKTwvc3RFdnQ6c29mdHdhcmVBZ2VudD4KICAgICAgICAgICAgICAgPC9yZGY6bGk+CiAgICAgICAgICAgICAgIDxyZGY6bGkgcmRmOnBhcnNlVHlwZT0iUmVzb3VyY2UiPgogICAgICAgICAgICAgICAgICA8c3RFdnQ6YWN0aW9uPnNhdmVkPC9zdEV2dDphY3Rpb24+CiAgICAgICAgICAgICAgICAgIDxzdEV2dDppbnN0YW5jZUlEPnhtcC5paWQ6ZmY1NDIzMTMtNTkwOS1hNTQ0LWJmMTMtZDNmMGVmOWM5NWJkPC9zdEV2dDppbnN0YW5jZUlEPgogICAgICAgICAgICAgICAgICA8c3RFdnQ6d2hlbj4yMDIzLTAxLTA3VDIxOjUzOjI5LTA1OjAwPC9zdEV2dDp3aGVuPgogICAgICAgICAgICAgICAgICA8c3RFdnQ6c29mdHdhcmVBZ2VudD5BZG9iZSBQaG90b3Nob3AgQ0MgMjAxNSAoV2luZG93cyk8L3N0RXZ0OnNvZnR3YXJlQWdlbnQ+CiAgICAgICAgICAgICAgICAgIDxzdEV2dDpjaGFuZ2VkPi88L3N0RXZ0OmNoYW5nZWQ+CiAgICAgICAgICAgICAgIDwvcmRmOmxpPgogICAgICAgICAgICA8L3JkZjpTZXE+CiAgICAgICAgIDwveG1wTU06SGlzdG9yeT4KICAgICAgICAgPHRpZmY6T3JpZW50YXRpb24+MTwvdGlmZjpPcmllbnRhdGlvbj4KICAgICAgICAgPHRpZmY6WFJlc29sdXRpb24+OTYwMDAwLzEwMDAwPC90aWZmOlhSZXNvbHV0aW9uPgogICAgICAgICA8dGlmZjpZUmVzb2x1dGlvbj45NjAwMDAvMTAwMDA8L3RpZmY6WVJlc29sdXRpb24+CiAgICAgICAgIDx0aWZmOlJlc29sdXRpb25Vbml0PjI8L3RpZmY6UmVzb2x1dGlvblVuaXQ+CiAgICAgICAgIDxleGlmOkNvbG9yU3BhY2U+NjU1MzU8L2V4aWY6Q29sb3JTcGFjZT4KICAgICAgICAgPGV4aWY6UGl4ZWxYRGltZW5zaW9uPjY0PC9leGlmOlBpeGVsWERpbWVuc2lvbj4KICAgICAgICAgPGV4aWY6UGl4ZWxZRGltZW5zaW9uPjY0PC9leGlmOlBpeGVsWURpbWVuc2lvbj4KICAgICAgPC9yZGY6RGVzY3JpcHRpb24+CiAgIDwvcmRmOlJERj4KPC94OnhtcG1ldGE+CiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgCjw/eHBhY2tldCBlbmQ9InciPz7z0Dw4AAAAIGNIUk0AAHolAACAgwAA+f8AAIDpAAB1MAAA6mAAADqYAAAXb5JfxUYAAAiSSURBVHja5FttTBTpHf+xy1J3wR4kKOvgNiU1l1ZqDMTEM0JsjKJRKjaRnCgQ0khNOcMRlEYSPhyJF5brtSFw1WK2Hy6G1MQAsea0HyQQcpFwraY5rcoVZSsu7MvMDrs7sy/sLk8/3LNmnMwu77g7fZLny7w+/9/M//33gBCC/+e5/i8AtADeA/BjAMUAygHUAfgIQDOdHwH4NT1XTK/NBqBNOQAAZAD4CYCzAL4A8AKADwBZ5vTRe7+gz9oBICMpAaBC7wbQAcC2AmGXOmfoO4rWCozVCp4L4AKAqWUIEQYQACBqtVpRq9WKAER6LLyM57wC8DGA3A0HAEAe/RKBBAuMGAwGwWQy+UtLS9mGhoaZtrY2t9ls9losFq6vr885ODhoHxwctPf19TktFgtnNpu9bW1t7oaGhpnS0lLWZDL5DQaDACCS4D1Bupa8dQcAgJ6iHoyzmBDDMN7Kykq72WzmhoeHZ202m0cQBD8hRCCEBAkh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';
    var size = new OpenLayers.Size(30, 30);
    var offset = new OpenLayers.Pixel(size.w * 0.5, -size.h);
    var icon = new OpenLayers.Icon(commentIcon, size, offset);
    var epsg4326 = new OpenLayers.Projection("EPSG:4326"); //WGS 1984 projection
    var projectTo = W.map.getProjectionObject(); //The map projection (Spherical Mercator)
    var lonLat = new OpenLayers.LonLat(x, y).transform(epsg4326, projectTo);
    var newMarker = new OpenLayers.Marker(lonLat, icon);
    newMarker.title = title;
    newMarker.comments = comments;
    newMarker.timestamp = datetime;
    newMarker.location = lonLat;
    newMarker.events.register('click', newMarker, popup);
    rtcCommentLayer.addMarker(newMarker);
}

//Generate the Popup
function popup(evt) {
    $("#rtcCommentContainer").remove();
    $("#rtcCommentContainer").hide();
    var popupHTML;
    W.map.moveTo(this.location);
    let htmlString = '<div id="rtcCommentContainer" style="max-width:500px;margin: 1;text-align: center;padding: 5px;z-index: 1100">' +
        '<a href="#close" id="gmCloseDlgBtn" title="Close" class="modalclose" style="color:#FF0000;">X</a>' +
        '<table border=1 class="rtcCommentTable"><tr><td colspan=2><div id="mydivheader" style="min-height: 20px;">' + this.title + '</div>'
    htmlString += '<hr class="myhrline"/></td></tr>';
    for (let i = 0; i < this.comments.length; i++) {
        htmlString += '<tr><td width=200 align=right>' + moment(new Date(this.timestamp[i])).format('LLL') + '</td><td align=left>' + this.comments[i] + '</td></tr>';
    }
    htmlString += '</table></div>'
    //moment(new Date(this.timestamp[i])).format('LLL')
    popupHTML = ([htmlString]);
    $("body").append(popupHTML);
    //Position the modal based on the position of the click event
    $("#rtcCommentContainer").css({ left: document.getElementById("user-tabs").offsetWidth + W.map.getPixelFromLonLat(W.map.getCenter()).x - document.getElementById("rtcCommentContainer").clientWidth - 10 });
    $("#rtcCommentContainer").css({ top: document.getElementById("left-app-head").offsetHeight + W.map.getPixelFromLonLat(W.map.getCenter()).y - (document.getElementById("rtcCommentContainer").clientHeight / 2) });
    $("#rtcCommentContainer").show();
    //Add listener for popup's "Close" button
    $("#gmCloseDlgBtn").click(function () {
        $("#rtcCommentContainer").remove();
        $("#rtcCommentContainer").hide();
    });
    dragElement(document.getElementById("rtcCommentContainer"));
}

function dragElement(elmnt) {
    var pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    if (document.getElementById("mydivheader")) {
        // if present, the header is where you move the DIV from:
        document.getElementById("mydivheader").onmousedown = dragMouseDown;
    } else {
        // otherwise, move the DIV from anywhere inside the DIV:
        elmnt.onmousedown = dragMouseDown;
    }
    function dragMouseDown(e) {
        e = e || window.event;
        e.preventDefault();
        // get the mouse cursor position at startup:
        pos3 = e.clientX;
        pos4 = e.clientY;
        document.onmouseup = closeDragElement;
        // call a function whenever the cursor moves:
        document.onmousemove = elementDrag;
    }

    function elementDrag(e) {
        e = e || window.event;
        e.preventDefault();
        // calculate the new cursor position:
        pos1 = pos3 - e.clientX;
        pos2 = pos4 - e.clientY;
        pos3 = e.clientX;
        pos4 = e.clientY;
        // set the element's new position:
        elmnt.style.top = (elmnt.offsetTop - pos2) + "px";
        elmnt.style.left = (elmnt.offsetLeft - pos1) + "px";
    }
    function closeDragElement() {
        // stop moving when mouse button is released:
        document.onmouseup = null;
        document.onmousemove = null;
    }
}

function installIcon() {
    console.log('Installing OpenLayers.Icon');
    OpenLayers.Icon = OpenLayers.Class({
        url: null,
        size: null,
        offset: null,
        calculateOffset: null,
        imageDiv: null,
        px: null,
        initialize: function (a, b, c, d) {
            this.url = a;
            this.size = b || { w: 20, h: 20 };
            this.offset = c || { x: -(this.size.w / 2), y: -(this.size.h / 2) };
            this.calculateOffset = d;
            a = OpenLayers.Util.createUniqueID("OL_Icon_");
            let div = this.imageDiv = OpenLayers.Util.createAlphaImageDiv(a);
            $(div.firstChild).removeClass('olAlphaImg'); // LEAVE THIS LINE TO PREVENT WME-HARDHATS SCRIPT FROM TURNING ALL ICONS INTO HARDHAT WAZERS --MAPOMATIC
        },
        destroy: function () { this.erase(); OpenLayers.Event.stopObservingElement(this.imageDiv.firstChild); this.imageDiv.innerHTML = ""; this.imageDiv = null; },
        clone: function () { return new OpenLayers.Icon(this.url, this.size, this.offset, this.calculateOffset); },
        setSize: function (a) { null !== a && (this.size = a); this.draw(); },
        setUrl: function (a) { null !== a && (this.url = a); this.draw(); },
        draw: function (a) {
            OpenLayers.Util.modifyAlphaImageDiv(this.imageDiv, null, null, this.size, this.url, "absolute");
            this.moveTo(a);
            return this.imageDiv;
        },
        erase: function () { null !== this.imageDiv && null !== this.imageDiv.parentNode && OpenLayers.Element.remove(this.imageDiv); },
        setOpacity: function (a) { OpenLayers.Util.modifyAlphaImageDiv(this.imageDiv, null, null, null, null, null, null, null, a); },
        moveTo: function (a) {
            null !== a && (this.px = a);
            null !== this.imageDiv && (null === this.px ? this.display(!1) : (
                this.calculateOffset && (this.offset = this.calculateOffset(this.size)),
                OpenLayers.Util.modifyAlphaImageDiv(this.imageDiv, null, { x: this.px.x + this.offset.x, y: this.px.y + this.offset.y })
            ));
        },
        display: function (a) { this.imageDiv.style.display = a ? "" : "none"; },
        isDrawn: function () { return this.imageDiv && this.imageDiv.parentNode && 11 != this.imageDiv.parentNode.nodeType; },
        CLASS_NAME: "OpenLayers.Icon"
    });
}

liveMapClosures_bootstrap();
