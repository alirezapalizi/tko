(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports) :
  typeof define === 'function' && define.amd ? define(['exports'], factory) :
  (factory((global.tko = global.tko || {}, global.tko.utils = {})));
}(this, function (exports) { 'use strict';

  //
  // ES6 Symbols
  //

  var useSymbols = typeof Symbol === 'function';

  function createSymbolOrString(identifier) {
      return useSymbols ? Symbol(identifier) : identifier;
  }

  var uniqueId = 0;
  var dataStoreKeyExpandoPropertyName = createSymbolOrString("__ko__data_store");
  var dataStore = {};


  function getAll(node, createIfNotFound) {
      var dataStoreKey = node[dataStoreKeyExpandoPropertyName];
      var hasExistingDataStore = dataStoreKey && (dataStoreKey !== "null") && dataStore[dataStoreKey];
      if (!hasExistingDataStore) {
          if (!createIfNotFound)
              return undefined;
          dataStoreKey = node[dataStoreKeyExpandoPropertyName] = "ko" + uniqueId++;
          dataStore[dataStoreKey] = {};
      }
      return dataStore[dataStoreKey];
  }

  function get(node, key) {
      var allDataForNode = getAll(node, false);
      return allDataForNode === undefined ? undefined : allDataForNode[key];
  }

  function set(node, key, value) {
      if (value === undefined) {
          // Make sure we don't actually create a new domData key if we are actually deleting a value
          if (getAll(node, false) === undefined)
              return;
      }
      var allDataForNode = getAll(node, true);
      allDataForNode[key] = value;
  }

  function clear(node) {
      var dataStoreKey = node[dataStoreKeyExpandoPropertyName];
      if (dataStoreKey) {
          delete dataStore[dataStoreKey];
          node[dataStoreKeyExpandoPropertyName] = null;
          return true; // Exposing "did clean" flag purely so specs can infer whether things have been cleaned up as intended
      }
      return false;
  }

  function nextKey() {
      return (uniqueId++) + dataStoreKeyExpandoPropertyName;
  }


  var domData = Object.freeze({
      get: get,
      set: set,
      clear: clear,
      nextKey: nextKey
  });

  //
  // Observables
  //


  function unwrapObservable (value) {
      return ko.isObservable(value) ? value() : value;
  }

  function peekObservable (value) {
      return ko.isObservable(value) ? value.peek() : value;
  }

  // Shorten `unwrap` alias
  var unwrap = unwrapObservable

  function arrayForEach(array, action) {
      for (var i = 0, j = array.length; i < j; i++)
          action(array[i], i);
  }

  function arrayIndexOf(array, item) {
      // IE9
      if (typeof Array.prototype.indexOf == "function")
          return Array.prototype.indexOf.call(array, item);
      for (var i = 0, j = array.length; i < j; i++)
          if (array[i] === item)
              return i;
      return -1;
  }

  function arrayFirst(array, predicate, predicateOwner) {
      for (var i = 0, j = array.length; i < j; i++)
          if (predicate.call(predicateOwner, array[i], i))
              return array[i];
      return null;
  }

  function arrayRemoveItem(array, itemToRemove) {
      var index = arrayIndexOf(array, itemToRemove);
      if (index > 0) {
          array.splice(index, 1);
      }
      else if (index === 0) {
          array.shift();
      }
  }

  function arrayGetDistinctValues(array) {
      array = array || [];
      var result = [];
      for (var i = 0, j = array.length; i < j; i++) {
          if (arrayIndexOf(result, array[i]) < 0)
              result.push(array[i]);
      }
      return result;
  }

  function arrayMap(array, mapping) {
      array = array || [];
      var result = [];
      for (var i = 0, j = array.length; i < j; i++)
          result.push(mapping(array[i], i));
      return result;
  }

  function arrayFilter(array, predicate) {
      array = array || [];
      var result = [];
      for (var i = 0, j = array.length; i < j; i++)
          if (predicate(array[i], i))
              result.push(array[i]);
      return result;
  }

  function arrayPushAll(array, valuesToPush) {
      if (valuesToPush instanceof Array)
          array.push.apply(array, valuesToPush);
      else
          for (var i = 0, j = valuesToPush.length; i < j; i++)
              array.push(valuesToPush[i]);
      return array;
  }

  function addOrRemoveItem(array, value, included) {
      var existingEntryIndex = arrayIndexOf(peekObservable(array), value);
      if (existingEntryIndex < 0) {
          if (included)
              array.push(value);
      } else {
          if (!included)
              array.splice(existingEntryIndex, 1);
      }
  }


  function makeArray(arrayLikeObject) {
      var result = [];
      for (var i = 0, j = arrayLikeObject.length; i < j; i++) {
          result.push(arrayLikeObject[i]);
      };
      return result;
  }


  function range(min, max) {
      min = unwrap(min);
      max = unwrap(max);
      var result = [];
      for (var i = min; i <= max; i++)
          result.push(i);
      return result;
  }

  //
  // jQuery
  //

  var jQueryInstance = window && window.jQuery

  function jQuerySetInstance(jquery) {
      jQueryInstance = jquery
  }

  var domDataKey = nextKey();
  var cleanableNodeTypes = { 1: true, 8: true, 9: true };       // Element, Comment, Document
  var cleanableNodeTypesWithDescendants = { 1: true, 9: true };

  function getDisposeCallbacksCollection(node, createIfNotFound) {
      var allDisposeCallbacks = get(node, domDataKey);
      if ((allDisposeCallbacks === undefined) && createIfNotFound) {
          allDisposeCallbacks = [];
          set(node, domDataKey, allDisposeCallbacks);
      }
      return allDisposeCallbacks;
  }
  function destroyCallbacksCollection(node) {
      set(node, domDataKey, undefined);
  }

  function cleanSingleNode(node) {
      // Run all the dispose callbacks
      var callbacks = getDisposeCallbacksCollection(node, false);
      if (callbacks) {
          callbacks = callbacks.slice(0); // Clone, as the array may be modified during iteration (typically, callbacks will remove themselves)
          for (var i = 0; i < callbacks.length; i++)
              callbacks[i](node);
      }

      // Erase the DOM data
      clear(node);

      // Perform cleanup needed by external libraries (currently only jQuery, but can be extended)
      cleanExternalData(node);

      // Clear any immediate-child comment nodes, as these wouldn't have been found by
      // node.getElementsByTagName("*") in cleanNode() (comment nodes aren't elements)
      if (cleanableNodeTypesWithDescendants[node.nodeType])
          cleanImmediateCommentTypeChildren(node);
  }

  function cleanImmediateCommentTypeChildren(nodeWithChildren) {
      var child, nextChild = nodeWithChildren.firstChild;
      while (child = nextChild) {
          nextChild = child.nextSibling;
          if (child.nodeType === 8)
              cleanSingleNode(child);
      }
  }

  // Exports
  function addDisposeCallback(node, callback) {
      if (typeof callback != "function")
          throw new Error("Callback must be a function");
      getDisposeCallbacksCollection(node, true).push(callback);
  }

  function removeDisposeCallback(node, callback) {
      var callbacksCollection = getDisposeCallbacksCollection(node, false);
      if (callbacksCollection) {
          arrayRemoveItem(callbacksCollection, callback);
          if (callbacksCollection.length == 0)
              destroyCallbacksCollection(node);
      }
  }

  function cleanNode(node) {
      // First clean this node, where applicable
      if (cleanableNodeTypes[node.nodeType]) {
          cleanSingleNode(node);

          // ... then its descendants, where applicable
          if (cleanableNodeTypesWithDescendants[node.nodeType]) {
              // Clone the descendants list in case it changes during iteration
              var descendants = [];
              arrayPushAll(descendants, node.getElementsByTagName("*"));
              for (var i = 0, j = descendants.length; i < j; i++)
                  cleanSingleNode(descendants[i]);
          }
      }
      return node;
  }

  function removeNode(node) {
      cleanNode(node);
      if (node.parentNode)
          node.parentNode.removeChild(node);
  }

  function cleanExternalData (node) {
      // Special support for jQuery here because it's so commonly used.
      // Many jQuery plugins (including jquery.tmpl) store data using jQuery's equivalent of domData
      // so notify it to tear down any resources associated with the node & descendants here.

      // Element, Document
      var jQueryCleanNodeFn = jQueryInstance
          ? jQueryInstance.cleanData : null;

      if (jQueryCleanNodeFn) {
          jQueryCleanNodeFn([node]);
      }
  }

  function moveCleanedNodesToContainerElement(nodes) {
      // Ensure it's a real array, as we're about to reparent the nodes and
      // we don't want the underlying collection to change while we're doing that.
      var nodesArray = makeArray(nodes);
      var templateDocument = (nodesArray[0] && nodesArray[0].ownerDocument) || document;

      var container = templateDocument.createElement('div');
      for (var i = 0, j = nodesArray.length; i < j; i++) {
          container.appendChild(cleanNode(nodesArray[i]));
      }
      return container;
  }

  function cloneNodes (nodesArray, shouldCleanNodes) {
      for (var i = 0, j = nodesArray.length, newNodesArray = []; i < j; i++) {
          var clonedNode = nodesArray[i].cloneNode(true);
          newNodesArray.push(shouldCleanNodes ? cleanNode(clonedNode) : clonedNode);
      }
      return newNodesArray;
  }

  function setRegularDomNodeChildren (domNode, childNodes) {
      emptyDomNode(domNode);
      if (childNodes) {
          for (var i = 0, j = childNodes.length; i < j; i++)
              domNode.appendChild(childNodes[i]);
      }
  }

  function replaceDomNodes (nodeToReplaceOrNodeArray, newNodesArray) {
      var nodesToReplaceArray = nodeToReplaceOrNodeArray.nodeType ? [nodeToReplaceOrNodeArray] : nodeToReplaceOrNodeArray;
      if (nodesToReplaceArray.length > 0) {
          var insertionPoint = nodesToReplaceArray[0];
          var parent = insertionPoint.parentNode;
          for (var i = 0, j = newNodesArray.length; i < j; i++)
              parent.insertBefore(newNodesArray[i], insertionPoint);
          for (var i = 0, j = nodesToReplaceArray.length; i < j; i++) {
              kremoveNode(nodesToReplaceArray[i]);
          }
      }
  }

  function setElementName(element, name) {
      element.name = name;

      // Workaround IE 6/7 issue
      // - https://github.com/SteveSanderson/knockout/issues/197
      // - http://www.matts411.com/post/setting_the_name_attribute_in_ie_dom/
      if (ieVersion <= 7) {
          try {
              element.mergeAttributes(document.createElement("<input name='" + element.name + "'/>"), false);
          }
          catch(e) {} // For IE9 with doc mode "IE9 Standards" and browser mode "IE9 Compatibility View"
      }
  }

  function setTextContent(element, textContent) {
      var value = unwrap(textContent);
      if ((value === null) || (value === undefined))
          value = "";

      // We need there to be exactly one child: a text node.
      // If there are no children, more than one, or if it's not a text node,
      // we'll clear everything and create a single text node.
      var innerTextNode = firstChild(element);
      if (!innerTextNode || innerTextNode.nodeType != 3 || nextSibling(innerTextNode)) {
          setDomNodeChildren(element, [element.ownerDocument.createTextNode(value)]);
      } else {
          innerTextNode.data = value;
      }

      forceRefresh(element);
  }

  function emptyDomNode (domNode) {
      while (domNode.firstChild) {
          removeNode(domNode.firstChild);
      }
  }

  function domNodeIsContainedBy (node, containedByNode) {
      if (node === containedByNode)
          return true;
      if (node.nodeType === 11)
          return false; // Fixes issue #1162 - can't use node.contains for document fragments on IE8
      if (containedByNode.contains)
          return containedByNode.contains(node.nodeType === 3 ? node.parentNode : node);
      if (containedByNode.compareDocumentPosition)
          return (containedByNode.compareDocumentPosition(node) & 16) == 16;
      while (node && node != containedByNode) {
          node = node.parentNode;
      }
      return !!node;
  }

  function domNodeIsAttachedToDocument (node) {
      return domNodeIsContainedBy(node, node.ownerDocument.documentElement);
  }

  function anyDomNodeIsAttachedToDocument(nodes) {
      return !!arrayFirst(nodes, ko.utils.domNodeIsAttachedToDocument);
  }

  function tagNameLower(element) {
      // For HTML elements, tagName will always be upper case; for XHTML elements, it'll be lower case.
      // Possible future optimization: If we know it's an element from an XHTML document (not HTML),
      // we don't need to do the .toLowerCase() as it will always be lower case anyway.
      return element && element.tagName && element.tagName.toLowerCase();
  }

  var commentNodesHaveTextProperty = document && document.createComment("test").text === "<!--test-->";

  var startCommentRegex = commentNodesHaveTextProperty ? /^<!--\s*ko(?:\s+([\s\S]+))?\s*-->$/ : /^\s*ko(?:\s+([\s\S]+))?\s*$/;
  var endCommentRegex =   commentNodesHaveTextProperty ? /^<!--\s*\/ko\s*-->$/ : /^\s*\/ko\s*$/;
  var htmlTagsWithOptionallyClosingChildren = { 'ul': true, 'ol': true };

  function isStartComment(node) {
      return (node.nodeType == 8) && startCommentRegex.test(commentNodesHaveTextProperty ? node.text : node.nodeValue);
  }

  function isEndComment(node) {
      return (node.nodeType == 8) && endCommentRegex.test(commentNodesHaveTextProperty ? node.text : node.nodeValue);
  }

  function getVirtualChildren(startComment, allowUnbalanced) {
      var currentNode = startComment;
      var depth = 1;
      var children = [];
      while (currentNode = currentNode.nextSibling) {
          if (isEndComment(currentNode)) {
              depth--;
              if (depth === 0)
                  return children;
          }

          children.push(currentNode);

          if (isStartComment(currentNode))
              depth++;
      }
      if (!allowUnbalanced)
          throw new Error("Cannot find closing comment tag to match: " + startComment.nodeValue);
      return null;
  }

  function getMatchingEndComment(startComment, allowUnbalanced) {
      var allVirtualChildren = getVirtualChildren(startComment, allowUnbalanced);
      if (allVirtualChildren) {
          if (allVirtualChildren.length > 0)
              return allVirtualChildren[allVirtualChildren.length - 1].nextSibling;
          return startComment.nextSibling;
      } else
          return null; // Must have no matching end comment, and allowUnbalanced is true
  }

  function getUnbalancedChildTags(node) {
      // e.g., from <div>OK</div><!-- ko blah --><span>Another</span>, returns: <!-- ko blah --><span>Another</span>
      //       from <div>OK</div><!-- /ko --><!-- /ko -->,             returns: <!-- /ko --><!-- /ko -->
      var childNode = node.firstChild, captureRemaining = null;
      if (childNode) {
          do {
              if (captureRemaining)                   // We already hit an unbalanced node and are now just scooping up all subsequent nodes
                  captureRemaining.push(childNode);
              else if (isStartComment(childNode)) {
                  var matchingEndComment = getMatchingEndComment(childNode, /* allowUnbalanced: */ true);
                  if (matchingEndComment)             // It's a balanced tag, so skip immediately to the end of this virtual set
                      childNode = matchingEndComment;
                  else
                      captureRemaining = [childNode]; // It's unbalanced, so start capturing from this point
              } else if (isEndComment(childNode)) {
                  captureRemaining = [childNode];     // It's unbalanced (if it wasn't, we'd have skipped over it already), so start capturing
              }
          } while (childNode = childNode.nextSibling);
      }
      return captureRemaining;
  }

  var allowedBindings = {}
  var hasBindingValue = isStartComment

  function childNodes(node) {
      return isStartComment(node) ? getVirtualChildren(node) : node.childNodes;
  }

  function emptyNode(node) {
      if (!isStartComment(node))
          emptyDomNode(node);
      else {
          var virtualChildren = childNodes(node);
          for (var i = 0, j = virtualChildren.length; i < j; i++)
              removeNode(virtualChildren[i]);
      }
  }

  function setDomNodeChildren(node, childNodes) {
      if (!isStartComment(node))
          setRegularDomNodeChildren(node, childNodes);
      else {
          emptyNode(node);
          var endCommentNode = node.nextSibling; // Must be the next sibling, as we just emptied the children
          for (var i = 0, j = childNodes.length; i < j; i++)
              endCommentNode.parentNode.insertBefore(childNodes[i], endCommentNode);
      }
  }

  function prepend(containerNode, nodeToPrepend) {
      if (!isStartComment(containerNode)) {
          if (containerNode.firstChild)
              containerNode.insertBefore(nodeToPrepend, containerNode.firstChild);
          else
              containerNode.appendChild(nodeToPrepend);
      } else {
          // Start comments must always have a parent and at least one following sibling (the end comment)
          containerNode.parentNode.insertBefore(nodeToPrepend, containerNode.nextSibling);
      }
  }

  function insertAfter(containerNode, nodeToInsert, insertAfterNode) {
      if (!insertAfterNode) {
          prepend(containerNode, nodeToInsert);
      } else if (!isStartComment(containerNode)) {
          // Insert after insertion point
          if (insertAfterNode.nextSibling)
              containerNode.insertBefore(nodeToInsert, insertAfterNode.nextSibling);
          else
              containerNode.appendChild(nodeToInsert);
      } else {
          // Children of start comments must always have a parent and at least one following sibling (the end comment)
          containerNode.parentNode.insertBefore(nodeToInsert, insertAfterNode.nextSibling);
      }
  }

  function firstChild(node) {
      if (!isStartComment(node))
          return node.firstChild;
      if (!node.nextSibling || isEndComment(node.nextSibling))
          return null;
      return node.nextSibling;
  }

  function nextSibling(node) {
      if (isStartComment(node))
          node = getMatchingEndComment(node);
      if (node.nextSibling && isEndComment(node.nextSibling))
          return null;
      return node.nextSibling;
  }

  function virtualNodeBindingValue(node) {
      var regexMatch = (commentNodesHaveTextProperty ? node.text : node.nodeValue).match(startCommentRegex);
      return regexMatch ? regexMatch[1] : null;
  }

  function normaliseVirtualElementDomStructure(elementVerified) {
      // Workaround for https://github.com/SteveSanderson/knockout/issues/155
      // (IE <= 8 or IE 9 quirks mode parses your HTML weirdly, treating closing </li> tags as if they don't exist, thereby moving comment nodes
      // that are direct descendants of <ul> into the preceding <li>)
      if (!htmlTagsWithOptionallyClosingChildren[tagNameLower(elementVerified)])
          return;

      // Scan immediate children to see if they contain unbalanced comment tags. If they do, those comment tags
      // must be intended to appear *after* that child, so move them there.
      var childNode = elementVerified.firstChild;
      if (childNode) {
          do {
              if (childNode.nodeType === 1) {
                  var unbalancedTags = getUnbalancedChildTags(childNode);
                  if (unbalancedTags) {
                      // Fix up the DOM by moving the unbalanced tags to where they most likely were intended to be placed - *after* the child
                      var nodeToInsertBefore = childNode.nextSibling;
                      for (var i = 0; i < unbalancedTags.length; i++) {
                          if (nodeToInsertBefore)
                              elementVerified.insertBefore(unbalancedTags[i], nodeToInsertBefore);
                          else
                              elementVerified.appendChild(unbalancedTags[i]);
                      }
                  }
              }
          } while (childNode = childNode.nextSibling);
      }
  }


  var virtualElements = Object.freeze({
      isStartComment: isStartComment,
      isEndComment: isEndComment,
      getVirtualChildren: getVirtualChildren,
      allowedBindings: allowedBindings,
      hasBindingValue: hasBindingValue,
      childNodes: childNodes,
      emptyNode: emptyNode,
      setDomNodeChildren: setDomNodeChildren,
      prepend: prepend,
      insertAfter: insertAfter,
      firstChild: firstChild,
      nextSibling: nextSibling,
      virtualNodeBindingValue: virtualNodeBindingValue,
      normaliseVirtualElementDomStructure: normaliseVirtualElementDomStructure
  });

  if (!Function.prototype['bind']) {
      // Shim/polyfill JavaScript Function.bind.
      // This implementation is based on the one in prototype.js
      Function.prototype['bind'] = function (object) {
          var originalFunction = this;
          if (arguments.length === 1) {
              return function () {
                  return originalFunction.apply(object, arguments);
              };
          } else {
              var partialArgs = Array.prototype.slice.call(arguments, 1);
              return function () {
                  var args = partialArgs.slice(0);
                  args.push.apply(args, arguments);
                  return originalFunction.apply(object, args);
              };
          }
      };
  }

  //
  // Error handling
  //

  function catchFunctionErrors(delegate) {
      return ko.onError ? function () {
          try {
              return delegate.apply(this, arguments);
          } catch (e) {
              ko.onError && ko.onError(e);
              throw e;
          }
      } : delegate;
  }

  function deferError(error) {
      setTimeout(function () {
          ko.onError && ko.onError(error);
          throw error;
      }, 0);
  }


  function setTimeout(handler, timeout) {
      return setTimeout(catchFunctionErrors(handler), timeout);
  }

  //
  // Object functions
  //

  function extend(target, source) {
      if (source) {
          for(var prop in source) {
              if(source.hasOwnProperty(prop)) {
                  target[prop] = source[prop];
              }
          }
      }
      return target;
  }

  function objectForEach(obj, action) {
      for (var prop in obj) {
          if (obj.hasOwnProperty(prop)) {
              action(prop, obj[prop]);
          }
      }
  }


  function objectMap(source, mapping) {
      if (!source)
          return source;
      var target = {};
      for (var prop in source) {
          if (source.hasOwnProperty(prop)) {
              target[prop] = mapping(source[prop], prop, source);
          }
      }
      return target;
  }

  var knownEvents = {};
  var knownEventTypesByEventName = {};
  var keyEventTypeName = (navigator && /Firefox\/2/i.test(navigator.userAgent)) ? 'KeyboardEvent' : 'UIEvents';

  knownEvents[keyEventTypeName] = ['keyup', 'keydown', 'keypress'];

  knownEvents['MouseEvents'] = [
    'click', 'dblclick', 'mousedown', 'mouseup', 'mousemove', 'mouseover',
    'mouseout', 'mouseenter', 'mouseleave'];


  objectForEach(knownEvents, function(eventType, knownEventsForType) {
      if (knownEventsForType.length) {
          for (var i = 0, j = knownEventsForType.length; i < j; i++)
              knownEventTypesByEventName[knownEventsForType[i]] = eventType;
      }
  });


  function isClickOnCheckableElement(element, eventType) {
      if ((ko.utils.tagNameLower(element) !== "input") || !element.type) return false;
      if (eventType.toLowerCase() != "click") return false;
      var inputType = element.type;
      return (inputType == "checkbox") || (inputType == "radio");
  }


  // Workaround for an IE9 issue - https://github.com/SteveSanderson/knockout/issues/406
  var eventsThatMustBeRegisteredUsingAttachEvent = { 'propertychange': true };

  function registerEventHandler(element, eventType, handler) {
      var wrappedHandler = ko.utils.catchFunctionErrors(handler);

      var mustUseAttachEvent = ieVersion && eventsThatMustBeRegisteredUsingAttachEvent[eventType];
      if (!ko.options['useOnlyNativeEvents'] && !mustUseAttachEvent && jQueryInstance) {
          jQueryInstance(element)['bind'](eventType, wrappedHandler);
      } else if (!mustUseAttachEvent && typeof element.addEventListener == "function")
          element.addEventListener(eventType, wrappedHandler, false);
      else if (typeof element.attachEvent != "undefined") {
          var attachEventHandler = function (event) { wrappedHandler.call(element, event); },
              attachEventName = "on" + eventType;
          element.attachEvent(attachEventName, attachEventHandler);

          // IE does not dispose attachEvent handlers automatically (unlike with addEventListener)
          // so to avoid leaks, we have to remove them manually. See bug #856
          ko.utils.domNodeDisposal.addDisposeCallback(element, function() {
              element.detachEvent(attachEventName, attachEventHandler);
          });
      } else
          throw new Error("Browser doesn't support addEventListener or attachEvent");
  }

  function triggerEvent(element, eventType) {
      if (!(element && element.nodeType))
          throw new Error("element must be a DOM node when calling triggerEvent");

      // For click events on checkboxes and radio buttons, jQuery toggles the element checked state *after* the
      // event handler runs instead of *before*. (This was fixed in 1.9 for checkboxes but not for radio buttons.)
      // IE doesn't change the checked state when you trigger the click event using "fireEvent".
      // In both cases, we'll use the click method instead.
      var useClickWorkaround = isClickOnCheckableElement(element, eventType);

      if (!ko.options['useOnlyNativeEvents'] && jQueryInstance && !useClickWorkaround) {
          jQueryInstance(element)['trigger'](eventType);
      } else if (typeof document.createEvent == "function") {
          if (typeof element.dispatchEvent == "function") {
              var eventCategory = knownEventTypesByEventName[eventType] || "HTMLEvents";
              var event = document.createEvent(eventCategory);
              event.initEvent(eventType, true, true, window, 0, 0, 0, 0, 0, false, false, false, false, 0, element);
              element.dispatchEvent(event);
          }
          else
              throw new Error("The supplied element doesn't support dispatchEvent");
      } else if (useClickWorkaround && element.click) {
          element.click();
      } else if (typeof element.fireEvent != "undefined") {
          element.fireEvent("on" + eventType);
      } else {
          throw new Error("Browser doesn't support triggering events");
      }
  }

  //
  // Detection and Workarounds for Internet Explorer
  //

  // Detect IE versions for bug workarounds (uses IE conditionals, not UA string, for robustness)
  // Note that, since IE 10 does not support conditional comments, the following logic only detects IE < 10.
  // Currently this is by design, since IE 10+ behaves correctly when treated as a standard browser.
  // If there is a future need to detect specific versions of IE10+, we will amend this.
  var ieVersion$1 = document && (function() {
      var version = 3, div = document.createElement('div'), iElems = div.getElementsByTagName('i');

      // Keep constructing conditional HTML blocks until we hit one that resolves to an empty fragment
      while (
          div.innerHTML = '<!--[if gt IE ' + (++version) + ']><i></i><![endif]-->',
          iElems[0]
      ) {}
      return version > 4 ? version : undefined;
  }());

  var isIe6 = ieVersion$1 === 6;
  var isIe7 = ieVersion$1 === 7;

  var canSetPrototype

  function setPrototypeOf(obj, proto) {
      obj.__proto__ = proto;
      return obj;
  }

  var setPrototypeOfOrExtend = canSetPrototype ? setPrototypeOf : extend

  function stringTrim (string) {
      return string === null || string === undefined ? '' :
          string.trim ?
              string.trim() :
              string.toString().replace(/^[\s\xa0]+|[\s\xa0]+$/g, '');
  }


  function stringStartsWith (string, startsWith) {
      string = string || "";
      if (startsWith.length > string.length)
          return false;
      return string.substring(0, startsWith.length) === startsWith;
  }


  function parseJson (jsonString) {
      if (typeof jsonString == "string") {
          jsonString = stringTrim(jsonString);
          if (jsonString) {
              if (JSON && JSON.parse) // Use native parsing where available
                  return JSON.parse(jsonString);
              return (new Function("return " + jsonString))(); // Fallback on less safe parsing for older browsers
          }
      }
      return null;
  }


  function stringifyJson (data, replacer, space) {   // replacer and space are optional
      if (!JSON || !JSON.stringify)
          throw new Error("Cannot find JSON.stringify(). Some browsers (e.g., IE < 8) don't support it natively, but you can overcome this by adding a script reference to json2.js, downloadable from http://www.json.org/json2.js");
      return JSON.stringify(unwrap(data), replacer, space);
  }


  // DEPRECATE?
  var fieldsIncludedWithJsonPost = 'DEPRECATED'
  // var fieldsIncludedWithJsonPost = [
  //   'authenticity_token', /^__RequestVerificationToken(_.*)?$/
  // ];

  function postJson () {
      throw new Error("DEPRECATED")
  }

  // For details on the pattern for changing node classes
  // see: https://github.com/knockout/knockout/issues/1597
  var cssClassNameRegex = /\S+/g;


  function toggleDomNodeCssClass(node, classNames, shouldHaveClass) {
      var addOrRemoveFn;
      if (!classNames) { return }
      if (typeof node.classList === 'object') {
          addOrRemoveFn = node.classList[shouldHaveClass ? 'add' : 'remove'];
          arrayForEach(classNames.match(cssClassNameRegex), function(className) {
              addOrRemoveFn.call(node.classList, className);
          });
      } else if (typeof node.className['baseVal'] === 'string') {
          // SVG tag .classNames is an SVGAnimatedString instance
          toggleObjectClassPropertyString(node.className, 'baseVal', classNames, shouldHaveClass);
      } else {
          // node.className ought to be a string.
          toggleObjectClassPropertyString(node, 'className', classNames, shouldHaveClass);
      }
  }


  function toggleObjectClassPropertyString(obj, prop, classNames, shouldHaveClass) {
      // obj/prop is either a node/'className' or a SVGAnimatedString/'baseVal'.
      var currentClassNames = obj[prop].match(cssClassNameRegex) || [];
      arrayForEach(classNames.match(cssClassNameRegex), function(className) {
          addOrRemoveItem(currentClassNames, className, shouldHaveClass);
      });
      obj[prop] = currentClassNames.join(" ");
  }

  //
  //  DOM node manipulation
  //


  function fixUpContinuousNodeArray(continuousNodeArray, parentNode) {
      // Before acting on a set of nodes that were previously outputted by a template function, we have to reconcile
      // them against what is in the DOM right now. It may be that some of the nodes have already been removed, or that
      // new nodes might have been inserted in the middle, for example by a binding. Also, there may previously have been
      // leading comment nodes (created by rewritten string-based templates) that have since been removed during binding.
      // So, this function translates the old "map" output array into its best guess of the set of current DOM nodes.
      //
      // Rules:
      //   [A] Any leading nodes that have been removed should be ignored
      //       These most likely correspond to memoization nodes that were already removed during binding
      //       See https://github.com/knockout/knockout/pull/440
      //   [B] Any trailing nodes that have been remove should be ignored
      //       This prevents the code here from adding unrelated nodes to the array while processing rule [C]
      //       See https://github.com/knockout/knockout/pull/1903
      //   [C] We want to output a continuous series of nodes. So, ignore any nodes that have already been removed,
      //       and include any nodes that have been inserted among the previous collection

      if (continuousNodeArray.length) {
          // The parent node can be a virtual element; so get the real parent node
          parentNode = (parentNode.nodeType === 8 && parentNode.parentNode) || parentNode;

          // Rule [A]
          while (continuousNodeArray.length && continuousNodeArray[0].parentNode !== parentNode)
              continuousNodeArray.splice(0, 1);

          // Rule [B]
          while (continuousNodeArray.length > 1 && continuousNodeArray[continuousNodeArray.length - 1].parentNode !== parentNode)
              continuousNodeArray.length--;

          // Rule [C]
          if (continuousNodeArray.length > 1) {
              var current = continuousNodeArray[0], last = continuousNodeArray[continuousNodeArray.length - 1];
              // Replace with the actual new continuous node set
              continuousNodeArray.length = 0;
              while (current !== last) {
                  continuousNodeArray.push(current);
                  current = current.nextSibling;
              }
              continuousNodeArray.push(last);
          }
      }
      return continuousNodeArray;
  }

  function setOptionNodeSelectionState (optionNode, isSelected) {
      // IE6 sometimes throws "unknown error" if you try to write to .selected directly, whereas Firefox struggles with setAttribute. Pick one based on browser.
      if (ieVersion < 7)
          optionNode.setAttribute("selected", isSelected);
      else
          optionNode.selected = isSelected;
  }


  function forceRefresh$1(node) {
      // Workaround for an IE9 rendering bug - https://github.com/SteveSanderson/knockout/issues/209
      if (ieVersion >= 9) {
          // For text nodes and comment nodes (most likely virtual elements), we will have to refresh the container
          var elem = node.nodeType == 1 ? node : node.parentNode;
          if (elem.style)
              elem.style.zoom = elem.style.zoom;
      }
  }

  function ensureSelectElementIsRenderedCorrectly(selectElement) {
      // Workaround for IE9 rendering bug - it doesn't reliably display all the text in dynamically-added select boxes unless you force it to re-render by updating the width.
      // (See https://github.com/SteveSanderson/knockout/issues/312, http://stackoverflow.com/questions/5908494/select-only-shows-first-char-of-selected-option)
      // Also fixes IE7 and IE8 bug that causes selects to be zero width if enclosed by 'if' or 'with'. (See issue #839)
      if (ieVersion) {
          var originalWidth = selectElement.style.width;
          selectElement.style.width = 0;
          selectElement.style.width = originalWidth;
      }
  }


  function getFormFields() {
      // Use e.g. $(":input")
      throw new Error("DEPRECATED")
  }

  var none = [0, "", ""];
  var table = [1, "<table>", "</table>"];
  var tbody = [2, "<table><tbody>", "</tbody></table>"];
  var colgroup = [ 2, "<table><tbody></tbody><colgroup>", "</colgroup></table>"];
  var tr = [3, "<table><tbody><tr>", "</tr></tbody></table>"];
  var select = [1, "<select multiple='multiple'>", "</select>"];
  var fieldset = [1, "<fieldset>", "</fieldset>"];
  var map = [1, "<map>", "</map>"];
  var object = [1, "<object>", "</object>"];
  var lookup = {
          'area': map,
          'col': colgroup,
          'colgroup': table,
          'caption': table,
          'legend': fieldset,
          'thead': table,
          'tbody': table,
          'tfoot': table,
          'tr': tbody,
          'td': tr,
          'th': tr,
          'option': select,
          'optgroup': select,
          'param': object
      };
  var supportsTemplateTag = 'content' in document.createElement('template');
  function getWrap(tags) {
      var m = tags.match(/^<([a-z]+)[ >]/);
      return (m && lookup[m[1]]) || none;
  }


  function simpleHtmlParse(html, documentContext) {
      documentContext || (documentContext = document);
      var windowContext = documentContext['parentWindow'] || documentContext['defaultView'] || window;

      // Based on jQuery's "clean" function, but only accounting for table-related elements.
      // If you have referenced jQuery, this won't be used anyway - KO will use jQuery's "clean" function directly

      // Note that there's still an issue in IE < 9 whereby it will discard comment nodes that are the first child of
      // a descendant node. For example: "<div><!-- mycomment -->abc</div>" will get parsed as "<div>abc</div>"
      // This won't affect anyone who has referenced jQuery, and there's always the workaround of inserting a dummy node
      // (possibly a text node) in front of the comment. So, KO does not attempt to workaround this IE issue automatically at present.

      // Trim whitespace, otherwise indexOf won't work as expected
      var tags = stringTrim(html).toLowerCase(), div = documentContext.createElement("div"),
          wrap = getWrap(tags),
          depth = wrap[0];

      // Go to html and back, then peel off extra wrappers
      // Note that we always prefix with some dummy text, because otherwise, IE<9 will strip out leading comment nodes in descendants. Total madness.
      var markup = "ignored<div>" + wrap[1] + html + wrap[2] + "</div>";
      if (typeof windowContext['innerShiv'] == "function") {
          // Note that innerShiv is deprecated in favour of html5shiv. We should consider adding
          // support for html5shiv (except if no explicit support is needed, e.g., if html5shiv
          // somehow shims the native APIs so it just works anyway)
          div.appendChild(windowContext['innerShiv'](markup));
      } else {
          div.innerHTML = markup;
      }

      // Move to the right depth
      while (depth--)
          div = div.lastChild;

      return makeArray(div.lastChild.childNodes);
  }


  function templateHtmlParse(html, documentContext) {
      if (!documentContext) { documentContext = document; }
      var template = documentContext.createElement('template');
      template.innerHTML = html;
      return makeArray(template.content.childNodes);
  }


  function jQueryHtmlParse(html, documentContext) {
      // jQuery's "parseHTML" function was introduced in jQuery 1.8.0 and is a documented public API.
      if (jQueryInstance.parseHTML) {
          return jQueryInstance.parseHTML(html, documentContext) || []; // Ensure we always return an array and never null
      } else {
          // For jQuery < 1.8.0, we fall back on the undocumented internal "clean" function.
          var elems = jQueryInstance.clean([html], documentContext);

          // As of jQuery 1.7.1, jQuery parses the HTML by appending it to some dummy parent nodes held in an in-memory document fragment.
          // Unfortunately, it never clears the dummy parent nodes from the document fragment, so it leaks memory over time.
          // Fix this by finding the top-most dummy parent element, and detaching it from its owner fragment.
          if (elems && elems[0]) {
              // Find the top-most parent element that's a direct child of a document fragment
              var elem = elems[0];
              while (elem.parentNode && elem.parentNode.nodeType !== 11 /* i.e., DocumentFragment */)
                  elem = elem.parentNode;
              // ... then detach it
              if (elem.parentNode)
                  elem.parentNode.removeChild(elem);
          }

          return elems;
      }
  }


  function parseHtmlFragment(html, documentContext) {
      return supportsTemplateTag ? templateHtmlParse(html, documentContext) :
          // Note jQuery's HTML parsing fails on element names like tr-*.
          // See: https://github.com/jquery/jquery/pull/1988
          (jQueryInstance ? jQueryHtmlParse(html, documentContext) :
          // Benefit from jQuery's on old browsers, where possible

          simpleHtmlParse(html, documentContext));
          // ... otherwise, this simple logic will do in most common cases.
  };


  function setHtml(node, html) {
      emptyDomNode(node);

      // There's no legitimate reason to display a stringified observable without unwrapping it, so we'll unwrap it
      html = unwrap(html);

      if ((html !== null) && (html !== undefined)) {
          if (typeof html !== 'string')
              html = html.toString();

          // jQuery contains a lot of sophisticated code to parse arbitrary HTML fragments,
          // for example <tr> elements which are not normally allowed to exist on their own.
          // If you've referenced jQuery we'll use that rather than duplicating its code.
          if (jQueryInstance) {
              jQueryInstance(node).html(html);
          } else {
              // ... otherwise, use KO's own parsing logic.
              var parsedNodes = parseHtmlFragment(html, node.ownerDocument);
              for (var i = 0; i < parsedNodes.length; i++)
                  node.appendChild(parsedNodes[i]);
          }
      }
  };

  exports.virtualElements = virtualElements;
  exports.domData = domData;
  exports.jQuerySetInstance = jQuerySetInstance;
  exports.arrayForEach = arrayForEach;
  exports.arrayIndexOf = arrayIndexOf;
  exports.arrayFirst = arrayFirst;
  exports.arrayRemoveItem = arrayRemoveItem;
  exports.arrayGetDistinctValues = arrayGetDistinctValues;
  exports.arrayMap = arrayMap;
  exports.arrayFilter = arrayFilter;
  exports.arrayPushAll = arrayPushAll;
  exports.addOrRemoveItem = addOrRemoveItem;
  exports.makeArray = makeArray;
  exports.range = range;
  exports.catchFunctionErrors = catchFunctionErrors;
  exports.deferError = deferError;
  exports.setTimeout = setTimeout;
  exports.registerEventHandler = registerEventHandler;
  exports.triggerEvent = triggerEvent;
  exports.ieVersion = ieVersion$1;
  exports.isIe6 = isIe6;
  exports.isIe7 = isIe7;
  exports.extend = extend;
  exports.objectForEach = objectForEach;
  exports.objectMap = objectMap;
  exports.unwrapObservable = unwrapObservable;
  exports.peekObservable = peekObservable;
  exports.unwrap = unwrap;
  exports.canSetPrototype = canSetPrototype;
  exports.setPrototypeOf = setPrototypeOf;
  exports.setPrototypeOfOrExtend = setPrototypeOfOrExtend;
  exports.stringTrim = stringTrim;
  exports.stringStartsWith = stringStartsWith;
  exports.parseJson = parseJson;
  exports.stringifyJson = stringifyJson;
  exports.fieldsIncludedWithJsonPost = fieldsIncludedWithJsonPost;
  exports.postJson = postJson;
  exports.useSymbols = useSymbols;
  exports.createSymbolOrString = createSymbolOrString;
  exports.toggleDomNodeCssClass = toggleDomNodeCssClass;
  exports.domNodeIsContainedBy = domNodeIsContainedBy;
  exports.domNodeIsAttachedToDocument = domNodeIsAttachedToDocument;
  exports.anyDomNodeIsAttachedToDocument = anyDomNodeIsAttachedToDocument;
  exports.tagNameLower = tagNameLower;
  exports.moveCleanedNodesToContainerElement = moveCleanedNodesToContainerElement;
  exports.cloneNodes = cloneNodes;
  exports.setDomNodeChildren = setRegularDomNodeChildren;
  exports.replaceDomNodes = replaceDomNodes;
  exports.setElementName = setElementName;
  exports.setTextContent = setTextContent;
  exports.emptyDomNode = emptyDomNode;
  exports.fixUpContinuousNodeArray = fixUpContinuousNodeArray;
  exports.setOptionNodeSelectionState = setOptionNodeSelectionState;
  exports.forceRefresh = forceRefresh$1;
  exports.ensureSelectElementIsRenderedCorrectly = ensureSelectElementIsRenderedCorrectly;
  exports.getFormFields = getFormFields;
  exports.parseHtmlFragment = parseHtmlFragment;
  exports.setHtml = setHtml;
  exports.addDisposeCallback = addDisposeCallback;
  exports.removeDisposeCallback = removeDisposeCallback;
  exports.cleanNode = cleanNode;
  exports.removeNode = removeNode;
  exports.cleanExternalData = cleanExternalData;

}));