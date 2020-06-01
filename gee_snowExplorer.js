
// Initialize the UI. 
//Clear the default UI since we're adding our own main and map panels.
ui.root.clear();
var mapPanel = ui.Map();
ui.root.widgets().reset([mapPanel]);


/*

MAKE MAIN PANEL

*/


var colors = {'cyan': '#24C1E0', 'transparent': '#11ffee00', 'gray': '#F8F9FA'};

var TITLE_STYLE = {
  fontWeight: '100',
  fontSize: '32px',
  padding: '8px',
  color: '#616161',
  backgroundColor: colors.transparent,
};

var SUBTITLE_STYLE = {
  fontSize: '16px',
  fontWeight: '80',
  color: '#616161',
  padding: '2px',
  backgroundColor: colors.transparent,
};


var PARAGRAPH_STYLE = {
  fontSize: '14px',
  fontWeight: '50',
  color: '#9E9E9E',
  padding: '8px',
  backgroundColor: colors.transparent,
};

var SUBPARAGRAPH_STYLE = {
  fontSize: '13px',
  fontWeight: '50',
  color: '#9E9E9E',
  padding: '2px',
  backgroundColor: colors.transparent,
};

var LABEL_STYLE = {
  fontWeight: '50',
  textAlign: 'center',
  fontSize: '11px',
  backgroundColor: colors.transparent,
};

var THUMBNAIL_WIDTH = 128;

var BORDER_STYLE = '4px solid rgba(97, 97, 97, 0.05)';


  var mainPanel = ui.Panel({
    layout: ui.Panel.Layout.flow('vertical', true),
    style: {
      stretch: 'horizontal',
      height: '60%',
      width: '570px',
      backgroundColor: colors.gray,
      border: BORDER_STYLE,
      position: 'top-left'
    }
  });

  // Add the app title to the side panel
  var titleLabel = ui.Label('Snow Explorer', TITLE_STYLE);
  mainPanel.add(titleLabel);

  // Add the app description to the main panel
  var descriptionText =
      'This app computes a Snow Cover Extent Layer based on user ' +
      'selected dates and Region of Interest.' +
      ' Data are derived from Sentinel-2 imagery.'  + 
      ' Please follow the steps below to run the tool:';
  var descriptionLabel = ui.Label(descriptionText, PARAGRAPH_STYLE);
  mainPanel.add(descriptionLabel);
  
  var firstSubTitle_text = '1) Select the Start and End dates';
  var firstSubTitle = ui.Label(firstSubTitle_text, SUBTITLE_STYLE);
  mainPanel.add(firstSubTitle);
  
   var firstSubParagraph_text = 'The tool will search for images between these dates. '+ 
                                 ' Date format must be: YYYY-MM-DD.';
   var firstSubParagraph = ui.Label(firstSubParagraph_text, SUBPARAGRAPH_STYLE);
   mainPanel.add(firstSubParagraph);
   
   
   //Get Today's date and pass it as default End date. 
   var now = new Date();
   var nowStr = now.toLocaleDateString('en-CA'); 
   var endDate = ui.Textbox({
     value: nowStr,
     placeholder: 'Enter End date here...',
     onChange: function(end) {
       endDate.setValue(end);
     }
    });
 
   //Get Last month's date date and pass it as default Start date.
   var dateNow = ee.Date(nowStr);
   var lastMonth = dateNow.advance(-1, 'month').format ("YYYY-MM-dd");
   
   var startDate = ui.Textbox({
     value: lastMonth.getInfo(),
     placeholder: 'Enter Start date here...',
     onChange: function(start) {
       startDate.setValue(start);
     }
    });
    
 
  
  mainPanel.add(startDate);
  mainPanel.add(endDate);

  var secondSubTitle_text = '2) Select the Region of Interest';
  var secondSubTitle = ui.Label(secondSubTitle_text, SUBTITLE_STYLE);
  mainPanel.add(secondSubTitle);
  
   var secondSubParagraph_text = 'Click on the button, then draw your Region of Interest (ROI) on the map.';
   var secondSubParagraph_textP = '(For best performance draw small ROIs)';
   var secondSubParagraph = ui.Label(secondSubParagraph_text, SUBPARAGRAPH_STYLE);
   var secondSubParagraphP = ui.Label(secondSubParagraph_textP, SUBPARAGRAPH_STYLE);
   mainPanel.add(secondSubParagraph);
   mainPanel.add(secondSubParagraphP);
  

// Use a SplitPanel so it's possible to resize the two panels.
var splitPanel = ui.SplitPanel({
  firstPanel: mainPanel,
  secondPanel: mapPanel,
  orientation: 'horizontal',
  style: {stretch: 'both'}
});

// Set the SplitPanel as the only thing in root.
ui.root.widgets().reset([splitPanel]);




/*

PROCESSING STARTS HERE

*/


mapPanel.setCenter (-120,50,7);


var drawButton = ui.Button({
  label: 'Draw a Rectangle',
  onClick: function() {
// Don't make imports that correspond to the drawn rectangles.
mapPanel.drawingTools().setLinked(false);
// Limit the draw modes to rectangles.
mapPanel.drawingTools().setDrawModes(['rectangle']);
// Add an empty layer to hold the drawn rectangle.
mapPanel.drawingTools().addLayer([]);
// Set the geometry type to be rectangle.
mapPanel.drawingTools().setShape('rectangle');
// Enter drawing mode.
mapPanel.drawingTools().draw();

mapPanel.drawingTools().onDraw(function (geometry) {
  // Do something with the geometry
  var AOI = mapPanel.drawingTools().toFeatureCollection(0);
  //Map.addLayer(AOI, null, 'Region of Interest');
  mapPanel.centerObject(AOI);
  mapPanel.drawingTools().stop();
  mapPanel.drawingTools().layers().forEach(function(layer) {
  layer.setShown(false);
  });

  //Define dates
  var date_start = startDate.getValue();
  var date_end= endDate.getValue();

  //Define a Cloud Threshold
  var cloud_threshold = 30;

  //Setup a function to caclulate the NDSI
  function CalculateNDSI(image) {
    var NDSI = image.normalizedDifference(['B3', 'B11']).rename('NDSI');
    return image.addBands(NDSI);
        } 
  
  //Add a Time band.
  function TimeBand (image) {
  return image.addBands(image.metadata('system:time_start'));
}

  //Setup a function to caclulate the Cloud and Cloud Shadow Mask        
  function CloudMask (image){
    var cloud_mask = image.expression(
      "((b('MSK_CLDPRB') >= 90)) || ((b('MSK_CLDPRB') >= 50) && (b('B8A') >= 3000)) || ((b('MSK_CLDPRB') >= 20) && (b('B8A') >= 9000)) ? 1 " +
         ": 0").rename('CloudMask');
    return image.addBands(cloud_mask);
        } 

  //Add Sentinel-2 Collection and filter using AOI, dates, cloud threshold.
  var S2 = ee.ImageCollection("COPERNICUS/S2_SR")
      .filterDate(date_start, date_end)
      .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', cloud_threshold))
      .sort('CLOUDY_PIXEL_PERCENTAGE')
      .sort('system:time_start')
      .filterBounds(AOI)
      .map(CloudMask) 
      .map(CalculateNDSI)
      .map(TimeBand);

  var nbr_images = S2.size().getInfo();
 // print (S2);
 // print (nbr_images);
  if (nbr_images === 0){
       var dateLabel = ui.Label('No images found. Refresh the view and select a wider date range', {
                       fontSize: '14px',
                       fontWeight: 'bold',
                       color: '#FF0000',
                       padding: '2px',
                       });
  }
       
  else {
    var range = S2.reduceColumns(ee.Reducer.minMax(), ["system:time_start"]);
    var latest = ee.Date(range.get('max')).format ("YYYY-MM-dd");
    //print (latest.getInfo());
    var dateLabel = ui.Label(latest.getInfo(), {fontWeight: 'bold'});
    //var year = latest.get('year');
    //var month = latest.get('month');
    //var day = latest.get('day');
    //var dateString = year.toString()+'-'+month.toString()+'-'+ day.toString();
  }

  var mosaic = S2.mosaic();

  //Create the Snow Cover Extent (SCE) layer

  var SCE = mosaic.expression(
      "((b('CloudMask') == 0 && (b('NDSI') >= 0.3) && (b('B4') >= 1000))) ? 2" +
       ": (b('CloudMask') == 1) ? 1" +
        ": 0"
    ).rename ('SnowIndex').clip(AOI);

  
  //Create a Band Composite image (SWIR2,SWIR1,Green)
  var BandComposite = mosaic.clip(AOI);

  //Set the visualisation parameters.

  var SCEkViz = {
    min: 0,
    max: 2,
    palette: ['yellow','red','blue'],
  };


  var BandCompViz = {
    min: 0,
    max: 1500,
    gamma: [0.95, 1.1, 1]
  };

  //var mask = SCE.gt(0);
  var SCE_masked = SCE.updateMask(SCE.gt(0));
  
  // Load SRTM Digital Elevation Model data.
var elevation = ee.Image('CGIAR/SRTM90_V4');

// Define an sld style color ramp to apply to the image.
var sld_ramp =
  '<RasterSymbolizer>' +
    '<ColorMap type="ramp" extended="false" >' +
      '<ColorMapEntry color="#aeefd5" quantity="400" label="400"/>' +
      '<ColorMapEntry color="#ecfcb3" quantity="600" label="600" />' +
      '<ColorMapEntry color="#39af30" quantity="800" label="800" />' +
      '<ColorMapEntry color="#6e9634" quantity="1000" label="1000" />' +
      '<ColorMapEntry color="#f09f02" quantity="1400" label="1400" />' +
      '<ColorMapEntry color="#901001" quantity="1600" label="1600" />' +
      '<ColorMapEntry color="#6e2308" quantity="1800" label="1800" />' +      
      '<ColorMapEntry color="#825336" quantity="2000" label="2000" />' +      
      '<ColorMapEntry color="#b0b0b0" quantity="2200" label="2200" />' +      
      '<ColorMapEntry color="#ebe9eb" quantity="2600" label="2600" />' +      
    '</ColorMap>' +
  '</RasterSymbolizer>';
  
  mapPanel.addLayer(elevation.sldStyle(sld_ramp).clip(AOI), {}, 'Elevation (m)');
  mapPanel.addLayer(BandComposite.select('B4', 'B3', 'B2','CloudMask').clip(AOI), BandCompViz, 'Sentinel-2 Imagery');
  mapPanel.addLayer(SCE_masked.clip(AOI), SCEkViz, 'Snow Cover Extent');
  
  
   /*

ADD DATE PANEL

*/

  var inspector = ui.Panel({
  style: {
    position: 'top-right',
    padding: '8px 20px'
          }
   });
   
   var dateLabeltext = ui.Label('Date of the most recent image is:');
   inspector.add(dateLabeltext);
   inspector.add(dateLabel);
   mapPanel.add(inspector);
 
 /*

ADD LEGEND PANEL

*/


// set position of panel
var legend = ui.Panel({
  style: {
    position: 'bottom-right',
    padding: '8px 20px'
  }
});

// Create legend title
var legendTitle = ui.Label({
  value: 'Legend',
  style: {
    fontWeight: 'bold',
    fontSize: '18px',
    margin: '0 0 4px 0',
    padding: '20'
    }
});

// Add the title to the panel
legend.add(legendTitle);

// Add 1st item lebel to the panel
var snowLabel = ui.Label({
  value: 'Snow Cover',
  style: {
    fontWeight: 'bold',    
    fontSize: '14px',
    margin: '0 0 4px 0',
    padding: '0'
    }
});
legend.add(snowLabel);

// Creates and styles 1 row of the legend.
var makeRow = function(color, name) {
      
      // Create the label that is actually the colored box.
      var colorBox = ui.Label({
        style: {
          backgroundColor: '#' + color,
          // Use padding to give the box height and width.
          padding: '8px',
          margin: '0 0 4px 0'
        }
      });
      
      // Create the label filled with the description text.
      var description = ui.Label({
        value: name,
        style: {margin: '0 0 4px 6px'}
      });
      
      // return the panel
      return ui.Panel({
        widgets: [colorBox, description],
        layout: ui.Panel.Layout.Flow('horizontal')
      });
};

//  Palette with the colors
var palette =['0000FF', 'FF0000'];

// name of the legend
var names = ['Snow','Clouds'];

// Add color and and names
for (var i = 0; i < 2; i++) {
  legend.add(makeRow(palette[i], names[i]));
  } 
  
// Add 2nd item lebel to the panel
var elevationLabel = ui.Label({
  value: 'Elevation (m)',
  style: {
    fontWeight: 'bold',    
    fontSize: '14px',
    margin: '0 0 4px 0',
    padding: '6'
    }
});
legend.add(elevationLabel);  

//  Palette with the colors - elevation
var palette2 =['aeefd5', 'ecfcb3','39af30','6e9634','f09f02','901001','6e2308','825336','b0b0b0','ebe9eb'];

// name of the legend
var names2 = ['400','600','800','1000','1400','1600','1800','2000','2200','2600'];

// Add color and and names
for (var j = 0; j < 10; j++) {
  legend.add(makeRow(palette2[j], names2[j]));
  }  

mapPanel.add(legend);

/*

ADD REFRESH TEXT

*/

var refreshPanel = ui.Panel();
var refreshText = ui.Label('To refresh the view and start again, press F5.', {fontWeight: 'bold'});
mapPanel.add(refreshPanel);
refreshPanel.add(refreshText);
 
});


  }

});

mainPanel.add(drawButton);





// ON-HOLD. Can't make this work properly!!
/*

ADD REFRESH BUTTON

*/

/*
var refreshButton = ui.Button({
  label: 'Reset!',
  onClick: function() {
    ui.root.clear();
    ui.root.widgets().reset([splitPanel]);

    
  }
});

mainPanel.add(refreshButton);
*/
