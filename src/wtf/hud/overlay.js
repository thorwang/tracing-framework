/**
 * Copyright 2012 Google, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by a BSD-style license that can be
 * found in the LICENSE file.
 */

/**
 * @fileoverview HUD overlay UI.
 *
 * @author benvanik@google.com (Ben Vanik)
 */

goog.provide('wtf.hud.Overlay');

goog.require('goog.asserts');
goog.require('goog.dom');
goog.require('goog.dom.TagName');
goog.require('goog.dom.classes');
goog.require('goog.events.EventType');
goog.require('goog.soy');
goog.require('goog.string');
goog.require('goog.style');
goog.require('wtf.events.Keyboard');
goog.require('wtf.events.KeyboardScope');
goog.require('wtf.hud.LiveGraph');
goog.require('wtf.hud.SettingsDialog');
goog.require('wtf.hud.overlay');
goog.require('wtf.io.BufferedHttpWriteStream');
goog.require('wtf.trace');
goog.require('wtf.ui.ResizableControl');
goog.require('wtf.util.Options');



/**
 * HUD overlay control UI.
 *
 * @param {!wtf.trace.Session} session Current tracing session.
 * @param {!wtf.util.Options} options Options.
 * @param {Element=} opt_parentElement Element to display in.
 * @constructor
 * @extends {wtf.ui.ResizableControl}
 */
wtf.hud.Overlay = function(session, options, opt_parentElement) {
  var dom = goog.dom.getDomHelper(opt_parentElement);
  var parentElement = /** @type {!Element} */ (
      opt_parentElement || dom.getDocument().body);
  goog.base(
      this,
      wtf.ui.ResizableControl.Orientation.VERTICAL,
      'wtfHudSplitter',
      parentElement,
      dom);

  // Add stylesheet to page.
  // Note that we don't use GSS so that we can avoid another file dependency
  // and renaming issues.
  dom.appendChild(this.getParentElement(),
      /** @type {!Element} */ (goog.soy.renderAsFragment(
          wtf.hud.overlay.style, undefined, undefined, dom)));

  /**
   * Tracing session.
   * @type {!wtf.trace.Session}
   * @private
   */
  this.session_ = session;

  /**
   * Options.
   * @type {!wtf.util.Options}
   * @private
   */
  this.options_ = options;

  /**
   * Docking position.
   * @type {wtf.hud.Overlay.DockPosition_}
   * @private
   */
  this.dockPosition_ = wtf.hud.Overlay.DockPosition_.BOTTOM_RIGHT;

  /**
   * The number of buttons currently added.
   * @type {number}
   * @private
   */
  this.buttonCount_ = 0;

  /**
   * Graph canvas.
   * @type {!wtf.hud.LiveGraph}
   * @private
   */
  this.liveGraph_ = new wtf.hud.LiveGraph(
      session, options, this.getChildElement('wtfHudGraph'));
  this.registerDisposable(this.liveGraph_);

  var keyboard = wtf.events.Keyboard.getWindowKeyboard(dom.getWindow());

  /**
   * Keyboard shortcut scope.
   * @type {!wtf.events.KeyboardScope}
   * @private
   */
  this.keyboardScope_ = new wtf.events.KeyboardScope(keyboard);
  this.registerDisposable(this.keyboardScope_);

  // Initial resize.
  this.setSplitterLimits(59, 500);
  this.setSplitterSize(80);

  // Add buttons.
  this.addButton_(
      true, 'wtfHudButtonSend', 'Send to UI', 'f9',
      this.sendSnapshotClicked_, this);
  this.addButton_(
      true, 'wtfHudButtonSave', 'Save Snapshot', 'f10',
      this.saveSnapshotClicked_, this);
  this.addButton_(
      true, 'wtfHudButtonSettings', 'Settings', null,
      this.settingsClicked_, this);

  // Listen for options changes and reload.
  this.options_.addListener(
      wtf.util.Options.EventType.CHANGED, this.reloadOptions_, this);
  this.reloadOptions_();

  // TODO(benvanik): generate counter code
  /*
  'counters': [
    {
      'name': 'foo::bar',
      'min': 0,
      'max': 100,
      'style': 'bar',
      'format': '{CUR:2}ms ({MIN:2}-{MAX:2})'
    }, ...
  ]
  'default': {
    'display': 'foo::bar'
  }
  */
  // var providerInfos = wtf.data.getAllProviders();
  // var providerMap = {};
  // for (var n = 0; n < providerInfos.length; n++) {
  //   providerMap[providerInfos[n].name] = providerInfo;
  // }
  // for (var n = 0; n < counters.length; n++) {
  //   var counter = counters[n];
  //   var nameParts = counter.name.split('::');
  //   var providerInfo = providerMap[nameParts[0]];
  //   var eventInfo = providerInfo.getEventByName(nameParts[1]);
  //   //
  // }
};
goog.inherits(wtf.hud.Overlay, wtf.ui.ResizableControl);


/**
 * @override
 */
wtf.hud.Overlay.prototype.disposeInternal = function() {
  this.options_.removeListener(
      wtf.util.Options.EventType.CHANGED, this.reloadOptions_, this);
  goog.base(this, 'disposeInternal');
};


/**
 * Overlay docking position.
 * @enum {string}
 * @private
 */
wtf.hud.Overlay.DockPosition_ = {
  /**
   * Dock at the top-left of the screen.
   */
  TOP_LEFT: 'tl',

  /**
   * Dock at the bottom-left of the screen.
   */
  BOTTOM_LEFT: 'bl',

  /**
   * Dock at the top-right of the screen.
   */
  TOP_RIGHT: 'tr',

  /**
   * Dock at the bottom-right of the screen.
   */
  BOTTOM_RIGHT: 'br'
};


/**
 * @override
 */
wtf.hud.Overlay.prototype.createDom = function(dom) {
  return /** @type {!Element} */ (goog.soy.renderAsFragment(
      wtf.hud.overlay.control, undefined, undefined, dom));
};


/**
 * @override
 */
wtf.hud.Overlay.prototype.layoutInternal = function() {
  this.liveGraph_.layout();
};


/**
 * Reloads options.
 * @private
 */
wtf.hud.Overlay.prototype.reloadOptions_ = function() {
  var options = this.options_;

  switch (options.getString('wtf.hud.dock', 'br')) {
    case 'tl':
      this.dockPosition_ = wtf.hud.Overlay.DockPosition_.TOP_LEFT;
      break;
    case 'bl':
      this.dockPosition_ = wtf.hud.Overlay.DockPosition_.BOTTOM_LEFT;
      break;
    case 'tr':
      this.dockPosition_ = wtf.hud.Overlay.DockPosition_.TOP_RIGHT;
      break;
    case 'br':
      this.dockPosition_ = wtf.hud.Overlay.DockPosition_.BOTTOM_RIGHT;
      break;
  }

  // Adjust position on page.
  var rootElement = this.getRootElement();
  switch (this.dockPosition_) {
    default:
    case wtf.hud.Overlay.DockPosition_.TOP_LEFT:
      goog.style.setStyle(rootElement, {
        'top': 0,
        'bottom': null,
        'left': 0,
        'right': null
      });
      this.setSizeFrom(wtf.ui.ResizableControl.SizeFrom.TOP_LEFT);
      break;
    case wtf.hud.Overlay.DockPosition_.BOTTOM_LEFT:
      goog.style.setStyle(rootElement, {
        'top': null,
        'bottom': 0,
        'left': 0,
        'right': null
      });
      this.setSizeFrom(wtf.ui.ResizableControl.SizeFrom.TOP_LEFT);
      break;
    case wtf.hud.Overlay.DockPosition_.TOP_RIGHT:
      goog.style.setStyle(rootElement, {
        'top': 0,
        'bottom': null,
        'left': null,
        'right': 0
      });
      this.setSizeFrom(wtf.ui.ResizableControl.SizeFrom.BOTTOM_RIGHT);
      break;
    case wtf.hud.Overlay.DockPosition_.BOTTOM_RIGHT:
      goog.style.setStyle(rootElement, {
        'top': null,
        'bottom': 0,
        'left': null,
        'right': 0
      });
      this.setSizeFrom(wtf.ui.ResizableControl.SizeFrom.BOTTOM_RIGHT);
      break;
  }
};


/**
 * Shows the overlay.
 */
wtf.hud.Overlay.prototype.show = function() {
  goog.style.setStyle(this.getRootElement(), 'display', '');
  this.liveGraph_.setEnabled(true);
};


/**
 * Hides the overlay.
 */
wtf.hud.Overlay.prototype.hide = function() {
  goog.style.setStyle(this.getRootElement(), 'display', 'none');
  this.liveGraph_.setEnabled(false);
};


/**
 * Advances the HUD time.
 * @param {number=} opt_time New time. Prefer using {@see wtf#now}.
 */
wtf.hud.Overlay.prototype.advance = function(opt_time) {
  this.liveGraph_.advance(opt_time);
};


/**
 * @typedef {{
 *   title: string,
 *   icon: string,
 *   shortcut: string?,
 *   callback: function(),
 *   scope: (Object|undefined)
 * }}
 */
wtf.hud.Overlay.ButtonInfo;


/**
 * Inserts a button to the left of the system buttons.
 * @param {!wtf.hud.Overlay.ButtonInfo} info Button info data.
 */
wtf.hud.Overlay.prototype.insertButton = function(info) {
  this.addButton_(
      false,
      info['icon'] || '',
      info['title'] || 'Action',
      info['shortcut'] || null,
      info['callback'],
      info['scope'] || undefined);
};


// TODO(benvanik): support toggleable actions
/**
 * Adds a button to the overlay button bar.
 * @param {boolean} isSystem System button.
 * @param {string} icon Data URI of an icon file or a CSS class name.
 * @param {string} title Title name for tooltips.
 * @param {string?} shortcut Shortcut key or null if not used.
 * @param {!function(this:T)} callback Callback when the action is invoked.
 * @param {T=} opt_scope Callback scope.
 * @template T
 * @private
 */
wtf.hud.Overlay.prototype.addButton_ = function(
    isSystem, icon, title, shortcut, callback, opt_scope) {
  // Create button.
  var dom = this.getDom();
  var el = dom.createElement(goog.dom.TagName.A);
  goog.dom.classes.add(el, 'wtfHudButton');
  el['title'] = title;
  var img = dom.createElement(goog.dom.TagName.IMG);
  img['alt'] = title;
  img['src'] = '';
  dom.appendChild(el, img);

  // Set icon.
  if (goog.string.startsWith(icon, 'data:')) {
    img['src'] = icon;
  } else {
    goog.dom.classes.add(el, icon);
  }

  // Add to DOM.
  var buttonBar = this.getChildElement('wtfHudButtons');
  if (isSystem) {
    dom.appendChild(buttonBar, el);
  } else {
    dom.insertChildAt(buttonBar, el, 0);
  }
  this.buttonCount_++;

  // Keyboard shortcut handler.
  if (shortcut) {
    this.keyboardScope_.addShortcut(shortcut, callback, opt_scope || this);
  }

  // Click handler.
  this.getHandler().listen(el,
      goog.events.EventType.CLICK, callback, false, opt_scope || this);

  // Measure and update extents.
  var splitterSize = this.getSplitterSize();
  var oldMinWidth = (this.buttonCount_ - 1) * 27 + 4;
  var newMinWidth = this.buttonCount_ * 27 + 4;
  this.setSplitterLimits(newMinWidth, 500);
  this.setSplitterSize((splitterSize - oldMinWidth) + newMinWidth);
};


/**
 * Handles clicks on the send to UI button.
 * @private
 */
wtf.hud.Overlay.prototype.sendSnapshotClicked_ = function() {
  // Send snapshot.
  this.sendSnapshot_();
};


/**
 * Handles clicks on the save button.
 * @private
 */
wtf.hud.Overlay.prototype.saveSnapshotClicked_ = function() {
  wtf.trace.snapshot();
};


/**
 * Handles clicks on the settings UI button.
 * @private
 */
wtf.hud.Overlay.prototype.settingsClicked_ = function() {
  // Show settings dialog.
  var dom = this.getDom();
  var body = dom.getDocument().body;
  goog.asserts.assert(body);
  var dialog = new wtf.hud.SettingsDialog(
      this.options_, body, dom);
};


/**
 * Sends a snapshot to the UI.
 * @private
 */
wtf.hud.Overlay.prototype.sendSnapshot_ = function() {
  // TODO(benvanik): something more sophisticated
  var host = COMPILED ? 'localhost:9023' : 'localhost:9024';
  host = this.options_.getString('wtf.app.endpoint', host);
  var url = 'http://' + host + '/snapshot/upload';

  // Capture snapshot into memory buffers.
  var buffers = [];
  wtf.trace.snapshot(function() {
    return new wtf.io.BufferedHttpWriteStream(url);
  });
};
