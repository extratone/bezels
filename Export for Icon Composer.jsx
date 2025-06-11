// Copyright (c) 2025 Apple, Inc.  All rights reserved.
// Export for Icon Composer

var version = "1";

function getSafeFilesystemName(name) {
  // Replace illegal characters '/' and ':' with "_"
  var sanitizedName = name.replace(/[\/:]/g, "_");

  // Remove control characters
  sanitizedName = sanitizedName.replace(/[\x00-\x1F]/g, "");

  while (sanitizedName.length > 0 && sanitizedName.charAt(0) === ".") {
    sanitizedName = sanitizedName.substring(1);
  }

  // Strip leading/trailing whitespace
  sanitizedName = sanitizedName.replace(/^\s+|\s+$/g, "");

  if (sanitizedName.length === 0) {
    return "Untitled";
  }

  return sanitizedName;
}

function getExportFolder() {
  var folder = Folder.selectDialog("Choose a folder to export files");
  if (folder == null) {
    return null;
  }
  return folder;
}

function getISOTimeStamp(date) {
  date = date || new Date();
  var datePart = [
    date.getFullYear(),
    ("0" + (date.getMonth() + 1)).slice(-2),
    ("0" + date.getDate()).slice(-2),
  ].join("-");
  var timePart = [
    ("0" + date.getHours()).slice(-2),
    ("0" + date.getMinutes()).slice(-2),
    ("0" + date.getSeconds()).slice(-2),
  ].join(".");

  return datePart + " " + timePart;
}

function createContainerFolder(doc, customFolder) {
  if (!doc) {
    alert("Error: No document provided");
    return null;
  }

  var docPath;
  if (customFolder) {
    docPath = customFolder.fsName;
  } else {
    if (!doc.path || doc.path.fsName === "") {
      alert(
        "Error: The document must be saved before you can export files next to it."
      );
      return null;
    }
    docPath = doc.path.fsName;
  }

  var docName = doc.name;
  var folderName = docName.replace(/\.[^.]+$/, ""); // Remove extension
  folderName = getSafeFilesystemName(folderName);

  var newFolderPath = docPath + "/" + folderName;

  var containerFolder = new Folder(newFolderPath);
  if (!containerFolder.exists) {
    if (!containerFolder.create()) {
      alert("Error: Failed to create folder: " + newFolderPath);
      return null;
    }
  } else {
    var timestamp = getISOTimeStamp();
    newFolderPath = docPath + "/" + folderName + " " + timestamp;
    containerFolder = new Folder(newFolderPath);

    if (!containerFolder.create()) {
      alert("Error: Failed to create folder: " + newFolderPath);
      return null;
    }
  }

  return containerFolder;
}

function getSVGOptions() {
  var options = new ExportOptionsSVG();
  options.embedRasterImages = true;
  options.coordinatePrecision = 7;
  options.fontSubsetting = SVGFontSubsetting.GLYPHSUSED;
  options.documentEncoding = SVGDocumentEncoding.UTF8;
  options.saveMultipleArtboards = false;
  return options;
}

function getPNGOptions() {
  var options = new ExportOptionsPNG24();
  options.antiAliasing = true;
  options.transparency = true;
  options.artBoardClipping = true;
  return options;
}

function createArtboardFolder(artboardName, exportFolder) {
  var safeArtboardName = getSafeFilesystemName(artboardName);
  var artboardFolder = new Folder(exportFolder.fsName + "/" + safeArtboardName);
  if (!artboardFolder.exists) {
    if (!artboardFolder.create()) {
      // Use the original artboard name in the error for user clarity.
      alert("Error: Could not create folder for artboard: " + artboardName);
      return null;
    }
  }
  return artboardFolder;
}

function itemOverlapsArtboard(item, artboardRect) {
  var itemLeft = item.visibleBounds[0];
  var itemTop = item.visibleBounds[1];
  var itemRight = item.visibleBounds[2];
  var itemBottom = item.visibleBounds[3];

  var artboardLeft = artboardRect[0];
  var artboardTop = artboardRect[1];
  var artboardRight = artboardRect[2];
  var artboardBottom = artboardRect[3];

  return (
    itemLeft < artboardRight &&
    itemRight > artboardLeft &&
    itemTop > artboardBottom &&
    itemBottom < artboardTop
  );
}

function layerHasVisibleItemsInArtboard(layer, artboardRect) {
  // return true if the layer has any content overlapping with the artboard
  for (var i = layer.pageItems.length - 1; i >= 0; i--) {
    var item = layer.pageItems[i];
    if (itemOverlapsArtboard(item, artboardRect)) {
      return true;
    }
  }
  return false;
}

function copyLayerToNewDocument(sourceLayer, artboardRect) {
  var width = artboardRect[2] - artboardRect[0];
  var height = artboardRect[1] - artboardRect[3];

  var newDoc = app.documents.add(DocumentColorSpace.RGB, width, height);
  newDoc.artboards[0].artboardRect = artboardRect;
  newDoc.layers[0].remove();

  var newLayer = newDoc.layers.add();
  newLayer.name = sourceLayer.name;

  for (var i = sourceLayer.pageItems.length - 1; i >= 0; i--) {
    var item = sourceLayer.pageItems[i];
    if (itemOverlapsArtboard(item, artboardRect)) {
      var dupe = item.duplicate(newLayer, ElementPlacement.INSIDE);
      dupe.position = item.position;
    }
  }

  return newDoc;
}

function processDocument(doc, format, customFolder) {
  var exportFolder = createContainerFolder(doc, customFolder);

  if (exportFolder == null) {
    return;
  }

  var exportOptions;
  var exportFormat;

  if (format == "SVG") {
    exportOptions = getSVGOptions();
    exportFormat = ExportType.SVG;
  } else if (format == "PNG") {
    exportOptions = getPNGOptions();
    exportFormat = ExportType.PNG24;
  } else {
    alert("Unsupported format: " + format);
    return;
  }

  for (var i = 0; i < doc.artboards.length; i++) {
    doc.artboards.setActiveArtboardIndex(i);
    var artboard = doc.artboards[i];
    // when a new doc is created the active artboard changes
    // so fetch all necessary properties now
    var artboardRect = artboard.artboardRect;
    var artboardName = artboard.name;

    var useArtboardFolder = doc.artboards.length > 1;
    var artboardFolder = null;
    var exportPath = exportFolder.fsName;

    var layersExported = 0;
    var totalLayers = 0;
    for (var j = 0; j < doc.layers.length; j++) {
      var layer = doc.layers[j];

      if (
        layer.visible &&
        layerHasVisibleItemsInArtboard(layer, artboardRect)
      ) {
        totalLayers++;
      }
    }

    for (var j = 0; j < doc.layers.length; j++) {
      var layer = doc.layers[j];

      if (
        layer.visible &&
        layerHasVisibleItemsInArtboard(layer, artboardRect)
      ) {
        if (useArtboardFolder) {
          if (artboardFolder === null) {
            artboardFolder = createArtboardFolder(artboardName, exportFolder);
            if (artboardFolder === null) {
              break;
            }
          }
          exportPath = artboardFolder.fsName;
        }

        var tempDoc = copyLayerToNewDocument(layer, artboardRect);

        var layerNumber = totalLayers - layersExported;

        var fileName = (
          layerNumber +
          "." +
          getSafeFilesystemName(layer.name) +
          "." +
          format
        ).toLowerCase();

        var file = new File(exportPath + "/" + fileName);
        tempDoc.exportFile(file, exportFormat, exportOptions);
        tempDoc.close(SaveOptions.DONOTSAVECHANGES);
        layersExported++;
      }
    }
  }
}

function batchProcessFiles(format, customFolder) {
  var aiFileFilter_macOS = function (f) {
    if (f instanceof Folder) return true;
    return /\.ai$/i.test(f.name);
  };

  var inputFiles = File.openDialog(
    "Select one or more Illustrator files",
    aiFileFilter_macOS,
    true
  );

  if (inputFiles != null) {
    for (var i = 0; i < inputFiles.length; i++) {
      var doc = app.open(inputFiles[i]);
      processDocument(doc, format, customFolder);
      doc.close(SaveOptions.DONOTSAVECHANGES);
    }
    alert("Processed " + inputFiles.length + " files");
  }
}

function showExportDialog() {
  var dialog = new Window("dialog", "Export for Icon Composer");
  dialog.alignChildren = "left"; // Align all children to the left

  // Main options group to contain processing options and format side by side
  var mainOptionsGroup = dialog.add("group");
  mainOptionsGroup.orientation = "row";
  mainOptionsGroup.alignChildren = "top";

  // File input choice
  var inputGroup = mainOptionsGroup.add(
    "panel",
    undefined,
    "Processing Options"
  );
  inputGroup.orientation = "column";
  inputGroup.alignChildren = "left";

  var currentDocRadio = inputGroup.add(
    "radiobutton",
    undefined,
    "Process Current Document"
  );
  var batchRadio = inputGroup.add(
    "radiobutton",
    undefined,
    "Batch Process Files"
  );

  // Format choice
  var formatPanel = mainOptionsGroup.add("panel", undefined, "Export Format");
  formatPanel.orientation = "column";
  formatPanel.alignChildren = "left";
  formatPanel.preferredSize.height = 78;

  var format = "SVG";
  var formatNames = ["SVG", "PNG"];

  dialog.formatList = formatPanel.add("dropdownlist", undefined, formatNames);
  dialog.formatList.selection = 0;
  dialog.formatList.preferredSize.width = 123;

  // Export location options
  var locationGroup = dialog.add("panel", undefined, "Export Location");
  locationGroup.orientation = "column";
  locationGroup.alignChildren = "left";

  var nextToRadio = locationGroup.add(
    "radiobutton",
    undefined,
    "Next to document"
  );
  var customFolderRadio = locationGroup.add(
    "radiobutton",
    undefined,
    "Custom export folder"
  );

  // Folder path and browse button
  var folderGroup = locationGroup.add("group");
  folderGroup.orientation = "row";
  folderGroup.alignment = "fill";

  var outputFolderText = folderGroup.add("edittext", undefined, "");
  outputFolderText.preferredSize.width = 250;
  outputFolderText.enabled = false;

  var browseButton = folderGroup.add("button", undefined, "Browse\u2026");
  browseButton.enabled = false;

  var selectedFolder = null;

  // Default to "Next to document" option
  nextToRadio.value = true;

  function validateCustomOutputFolder() {
    if (customFolderRadio.value) {
      var isValidPath = false;

      if (selectedFolder && selectedFolder.exists) {
        isValidPath = true;
      } else if (outputFolderText.text != "") {
        var testFolder = new Folder(outputFolderText.text);
        isValidPath = testFolder.exists;
      }

      exportButton.enabled = isValidPath;
    } else {
      // "Next to document" is selected
      exportButton.enabled = true;
    }
  }

  nextToRadio.onClick = function () {
    outputFolderText.enabled = false;
    browseButton.enabled = false;
    validateCustomOutputFolder();
  };

  customFolderRadio.onClick = function () {
    outputFolderText.enabled = true;
    browseButton.enabled = true;
    validateCustomOutputFolder();
  };

  outputFolderText.onChanging = function () {
    selectedFolder = new Folder(outputFolderText.text);
    validateCustomOutputFolder();
  };

  browseButton.onClick = function () {
    var folder = getExportFolder();
    if (folder != null) {
      selectedFolder = folder;
      outputFolderText.text = folder.fsName;
      validateCustomOutputFolder();
    }
  };

  // Dialog main buttons
  var mainButtonGroup = dialog.add("group");
  mainButtonGroup.orientation = "row";
  mainButtonGroup.alignment = "right";
  var cancelButton = mainButtonGroup.add("button", undefined, "Cancel");
  var exportButton = mainButtonGroup.add("button", undefined, "Export");

  if (app.documents.length > 0) {
    currentDocRadio.value = true;
  } else {
    batchRadio.value = true;
    currentDocRadio.enabled = false;
  }
  nextToRadio.value = true; // Default to next to document

  cancelButton.onClick = function () {
    dialog.close();
  };

  exportButton.onClick = function () {
    dialog.close();

    format = formatNames[dialog.formatList.selection.index];
    var customFolder = null;

    if (customFolderRadio.value) {
      customFolder = selectedFolder;
    }

    if (currentDocRadio.value) {
      processDocument(app.activeDocument, format, customFolder);
    } else {
      batchProcessFiles(format, customFolder);
    }
  };

  validateCustomOutputFolder();

  exportButton.active = true;
  dialog.defaultElement = exportButton;
  dialog.show();
}

showExportDialog();
