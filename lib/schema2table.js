/*jslint node: true,nomen: true, vars: true */
/*jshint maxcomplexity: 5 */
'use strict';

var async = require('async');
var _ = require('lodash');
var schemaResolver = require('./schema.resolver');
var SchemaDependencies = require('./schema.dependencies');
var defaultFormPack = require('./pack/handlebars-browser/handlebars.pack');
var util = require('./schema.util');

var expId  = /--([0-9]+)/g; // id abstraction
var expBracket = /\[([0-9]+)\]/g; // array key abstraction
var expIdDummy = /id\=\"/g;
var idxReplace = "--index--";

/**
 * @class Schema2Table
 *
 * @param {object} schema Json Schema object to render into form
 * @param {object} data Data object to render
 * @param {Schema2TableOptions} options Configuration object for rendering loop
 */

/**
 * @typedef Schema2TableOptions
 * @description Configuration object for render loop
 *
 * @param {string} schemaBasePath If loading $ref schema files from local fs, path should be specified
 * @param {string} dataPrefix If your data needs prefixing, assign the a prefix to each variable and name
 * @param {object} pack Form pack to use
 */

function Schema2Table(schema, data, options) {
    this.schema = schema || {};
    this.data = data || {};
    this.options = options || {};
    this.options.dataPrefix = this.options.dataPrefix || null;
    this.templates = {};
    this.funcs = [];
    this.html = [];
    this.htmlTemplate = [];
    this.dependencyCache = {};
    this.additionalData = {};
    this.schemaBasePath = this.options.schemaBasePath;
    this.pack = this.options.pack || defaultFormPack;
    this.pack.build();
    this.renderMode = this.pack.renderMode || 1;
    this.pos = 0;
    this.arrayLoopCount = 0;
    this.rawData = this.options.rawData || false;
	this.showActions = this.options.showActions || false;
    this.lookupTable = {
        object: this.renderLoopObject.bind(this),
        string: this.renderLoopString.bind(this),
        array: this.renderLoopNoop.bind(this),
        number: this.renderLoopNumber.bind(this),
        integer: this.renderLoopInteger.bind(this),
        boolean: this.renderLoopBoolean.bind(this),
        ref: this.renderLoopRef.bind(this)
    };
    this.headerLookupTable = {
        object: this.renderHeaderLoopObject.bind(this),
        string: this.renderHeaderLoopString.bind(this),
        array: this.renderLoopNoop.bind(this),
        number: this.renderHeaderLoopString.bind(this),
        integer: this.renderHeaderLoopString.bind(this),
        boolean: this.renderHeaderLoopString.bind(this),
        ref: this.renderHeaderLoopString.bind(this)
    };
}

/**
 * @memberOf Schema2Table
 * @description Add a data resolving function
 *
 * @param {string} key
 * @param {function} func
 */

Schema2Table.prototype.addResolver = function(key, func) {
    schemaResolver[key] = func;
};

/**
 * @memberOf Schema2Table
 * @description Load all dependencies and output html talbe
 *
 * @param {function} callback
 */
Schema2Table.prototype.buildTablePromise = function() {

	var _that = this;

	this.addRenderTask(this.addTableOpen(this.schema.id, this.options.endpoint, this.options.method));
	this.addRenderTask(this.addTableHeaderOpen());
	this.addRenderTask(this.addTableRowOpen());
	this.renderHeaderLoop(this.schema, 0, this.options.dataPrefix, false);
	this.addRenderTask(this.addTableHeaderActions(this.schema.id, this.options.endpoint, this.options.method));
	this.addRenderTask(this.addTableRowClose());
	this.addRenderTask(this.addTableHeaderClose());
	this.addRenderTask(this.addTableBodyOpen());
	this.addRenderTask(this.addTableRowOpen());
	this.renderLoop(this.schema, 0, this.options.dataPrefix, false);
	this.addRenderTask(this.addTableActions(this.schema.id, this.options.endpoint, this.options.method));
	this.addRenderTask(this.addTableRowClose());
	this.addRenderTask(this.addTableBodyClose());
	this.addRenderTask(this.addTableClose());

	return new Promise(function(resolve, reject) {
		async.series(_that.funcs, function(err, results) {
			if (err) {
				reject(err);
				return;
			}
			resolve(_that.html.join(""));
		});
	});
};






Schema2Table.prototype.registerCustomType = function(){

}

Schema2Table.prototype.lookupCustomType = function(type) {

    if(this.customType[type]){

    }

    return this.renderLoopObject.bind(this);
}



Schema2Table.prototype.lookupTableFunc = function(type, schema) {
    var execProcess = this.lookupTable[type] || null;

    if(execProcess === null) {
        //execProcess = this.lookupCustomType(type, schema);
    }

    return execProcess;
}

/**
 * @memberOf Schema2Table
 * @description Main circular render loop, all objects are passed through the loop, with render functions then being executed through the aysnc library
 *
 * @param {object} schema
 * @param {integer} depth
 * @param {string} scopeName
 */

Schema2Table.prototype.renderLoop = function(schema, depth, scopeName) {
    schema = schema || {};
    var type = schema.$ref ? 'ref' : schema.type,
        id = schema.id || scopeName,
        execProcess;

    id = this.generateId(id);



    execProcess = this.lookupTable[type] || null;

    if (execProcess !== null && this.pack.security(schema) === true) {
        execProcess(id, scopeName, depth, schema);
    }

	console.log("SHOW ACTIONS", this.showActions);

	if (this.showActions) {
		console.log("SHOW ACTIONS 2", this.showActions);
		this.addTableActions(id, scopeName, depth, schema);
	}
};


/**
 * @memberOf Schema2Table
 * @description Main circular render loop, all objects are passed through the loop, with render functions then being executed through the aysnc library
 *
 * @param {object} schema
 * @param {integer} depth
 * @param {string} scopeName
 */

Schema2Table.prototype.renderHeaderLoop = function(schema, depth, scopeName) {
    schema = schema || {};
    var type = schema.$ref ? 'ref' : schema.type,
        id = schema.id || scopeName,
        execProcess;

    id = this.generateId(id);



    execProcess = this.headerLookupTable[type] || null;


    if (execProcess !== null && this.pack.security(schema) === true) {
        execProcess(id, scopeName, depth, schema);
    }

	if (this.showActions) {
		console.log("WILL RENDER HEADER ACTIONS");
		this.addTableHeaderActions(id, scopeName, depth, schema);
	}
};


/**
 * @memberOf Schema2Table
 * @description adds an individual render task for the string schema type
 *
 * @param {string} id html id string
 * @param {string} name html name string
 * @param {integer} depth how deep the item is nested
 * @param {object} schema
 */

Schema2Table.prototype.renderLoopNoop = function(id, name, depth, schema) {
};




/**
 * @memberOf Schema2Table
 * @description adds an individual render task for the string schema type
 *
 * @param {string} id html id string
 * @param {string} name html name string
 * @param {integer} depth how deep the item is nested
 * @param {object} schema
 */

Schema2Table.prototype.renderLoopString = function(id, name, depth, schema) {
    var label = schema.title || name,
        options = schema.options || {},
        val = util.retrieveValue(this.data, name, false);

    options.depth = depth;
    options.key = util.dotSyntax(name);


    this.addRenderTask(this.addString(id, name, val, label, null, options));
};


Schema2Table.prototype.renderHeaderLoopString = function(id, name, depth, schema) {
    var label = schema.title || name,
        options = schema.options || {},
        val = util.retrieveValue(this.data, name, false);

    options.depth = depth;
    options.key = util.dotSyntax(name);


	console.log("HEADER STRING", id);
    this.addRenderTask(this.addHeaderString(id, name, val, label, null, options));
};

/**
 * @memberOf Schema2Table
 * 
 * @param {string} id html id string
 * @param {string} name html name string
 * @param {integer} depth how deep the item is nested
 * @param {object} schema
 * 
 */

Schema2Table.prototype.renderLoopRef = function(id, name, depth, schema) {
    //this.dependencyCache[schema.$ref].type || null; // try ref if no type
    this.renderLoop(this.dependencyCache[schema.$ref], depth, name);
};

/**
 * @memberOf Schema2Table
 * @description renders schema#object
 *
 * @param {string} id html id string
 * @param {string} scopeName html name string
 * @param {integer} depth how deep the item is nested
 * @param {object} schema
 */

Schema2Table.prototype.renderLoopObject = function(id, scopeName, depth, schema) {
    var _that = this, name, match, options;

    options = schema.options || {};
    depth += 1;

    //this.addRenderTask(this.addGroupOpen(id, 0, depth, schema)); // open a group

    _.forOwn(schema.properties, function(property, key) {
        name = _that.generateName(scopeName, key);
        property.id = _that.generateId(name);
        if (property.anyOf !== undefined) {
            if (_.isArray(property.anyOf)) {

            }
        } else {
            _that.renderLoop(property, depth + 1, name); // send property back in the loop
        }
    });

    //this.addRenderTask(this.addGroupClose(id, depth)); // close group


};

Schema2Table.prototype.renderHeaderLoopObject = function(id, scopeName, depth, schema) {
    var _that = this, name, match, options;

    options = schema.options || {};
    depth += 1;

    //this.addRenderTask(this.addGroupOpen(id, 0, depth, schema)); // open a group

    _.forOwn(schema.properties, function(property, key) {
        name = _that.generateName(scopeName, key);
        property.id = _that.generateId(name);
        if (property.anyOf !== undefined) {
            if (_.isArray(property.anyOf)) {
        
            }
        } else {
            _that.renderHeaderLoop(property, depth + 1, name); // send property back in the loop
        }
    });

    //this.addRenderTask(this.addGroupClose(id, depth)); // close group


};

/**
 * @memberOf Schema2Table
 * @description adds an individual render task for the array schema type
 *
 * @param {string} id
 * @param {string} name
 * @param {integer} depth
 * @param {integer} index
 * @param {string} match
 * @param {object} schema
 */

Schema2Table.prototype.renderLoopArrayAnyOf = function(id, name, depth, index, match, schema) {
    var _that = this,
        ref,
        matchVal;

    _that.arrayLoopCount += 1;

    schema.anyOf.forEach(function(val) {
        ref = val.$ref;

        matchVal = util.retrieveValue(_that.data, (name + '[' + index + ']' + '[' + match + ']'));

        if (ref === matchVal && _that.renderMode !== 2) {
            _that.renderLoop(_that.dependencyCache[ref], (depth + 1), (name + '[' + index + ']'));
        } else if (_that.renderMode === 2) {
            // render mode is 2, means were rendering a template based output
            var indexVal = _that.pack.engine.index;
            var backtickVal = _that.pack.engine.backTick;
            var open = _that.pack.engine.open;
            var close =  _that.pack.engine.close;

            _that.addRenderTask(_that.addAnyOfOpen(ref));
            _that.renderLoop(_that.dependencyCache[ref], (depth + 1), (name + '[' + open + util.repeat(_that.arrayLoopCount, backtickVal) + indexVal + close + ']'));
            _that.addRenderTask(_that.addAnyOfClose(ref));
        }

    });

    _that.arrayLoopCount += -1;
};

/**
 * @memberOf Schema2Table
 * @description adds render tasks for an item within an array
 *
 * @param {string} id
 * @param {string} name
 * @param {integer} depth
 * @param {integer} index
 * @param {object} schema
 */

Schema2Table.prototype.renderLoopArrayItem = function(id, name, depth, index, schema) {
    

    // plain old item definition
    if (this.renderMode === 2) {

        var indexVal = this.pack.engine.index;
        var open = this.pack.engine.open;
        var close =  this.pack.engine.close;

        this.addRenderTask(this.addGroupTag('groupItemOpen', id + '-group-' + open + indexVal + close + '-' + name + '[' + open + indexVal + close + ']', depth + 1)); // render tag open
        this.renderLoop(schema, depth + 1, name + '[' + open + indexVal + close + ']');
        this.addRenderTask(this.addGroupTag('groupItemClose', id + '-group-' + open + indexVal + close, name + '[' + open + indexVal + close + ']', depth + 1)); // render tag close

        return id + '-group-' + open + indexVal + close + '-' + name + '[' + open + indexVal + close + ']';

    } else {
        this.addRenderTask(this.addGroupTag('groupItemOpen', id + '-group--' + index, name + '[' + index + ']', depth + 1)); // render tag open
        this.renderLoop(schema, depth + 1, name + '[' + index + ']');
        this.addRenderTask(this.addGroupTag('groupItemClose', id + '-group--' + index, name + '[' + index + ']', depth + 1)); // render tag close

        return id + '-group--' + index;
    }

    
};

/**
 * @memberOf Schema2Table
 * @description adds render tasks for schema#array
 *
 * @param {string} id
 * @param {string} name
 * @param {integer} depth
 * @param {object} schema
 */


Schema2Table.prototype.renderLoopArray = function(id, name, depth, schema) {
    var _that = this,
        insertId = "",
        minItems = schema.minItems || 1,
        maxItems = schema.maxItems,
        uniqueItems = schema.uniqueItems,
        itemsToRender,
        options,
        dataArr,
        match,
        ref,
        i;


    options = schema.items.options || {};
    dataArr = util.retrieveValue(this.data, name);

    itemsToRender = _.isArray(dataArr) ? dataArr.length : minItems;
    itemsToRender = itemsToRender || 1;
    itemsToRender = this.renderMode === 2 ? 1 : itemsToRender;

    this.addRenderTask(this.addGroupTag('groupArrayOpen', id + '-group-many', name, depth, schema)); // open a group
    

    for (i = 0; i < itemsToRender; i += 1) {
        if (schema.items.$ref) {
            this.renderLoopArrayItem(id, name, depth, i, _that.dependencyCache[schema.items.$ref]);
        } else if (schema.items.anyOf) {
            match = options.matchOn;

            this.renderLoopArrayAnyOf(id, name, depth, i, match, schema.items);

        } else if (schema.items.oneOf) {
            match = options.matchOn;

            schema.items.oneOf.forEach(function(val, index) {
                ref = val.$ref;

                if (ref === match) {
                    this.renderLoop(_that.dependencyCache[ref], depth + 1, name + '[' + index + ']');
                }

            });

        } else {
            insertId = this.renderLoopArrayItem(id, name, depth, i, schema.items);
        }
    }

    insertId = insertId.replace(expId, '-' + idxReplace).replace(expBracket, '[' + idxReplace + ']');

    
    schema.insertTemplate = 'tmpl-' + insertId;

    this.addRenderTask(this.addGroupTag('groupArrayClose', id + '-group-many', name, depth, schema)); // open a group

};

/**
 * @memberOf Schema2Table
 * @description adds an individual render task for the number schema type
 * 
 * @param {string} id html id string
 * @param {string} name html name string
 * @param {integer} depth how deep the item is nested
 * @param {object} schema
 */

Schema2Table.prototype.renderLoopNumber = function(id, name, depth, schema) {
    this.renderLoopString(id, name, depth, schema);
};

/**
 * @memberOf Schema2Table
 * @description adds an individual render task for the integer schema type
 *
 * @param {string} id html id string
 * @param {string} name html name string
 * @param {integer} depth how deep the item is nested
 * @param {object} schema
 */

Schema2Table.prototype.renderLoopInteger = function(id, name, depth, schema) {
    this.renderLoopString(id, name, depth, schema);
};

/**
 * @memberOf Schema2Table
 * @description adds an individual render task for the boolean schema type
 *
 * @param {string} id html id string
 * @param {string} name html name string
 * @param {integer} depth how deep the item is nested
 * @param {object} schema
 */

Schema2Table.prototype.renderLoopBoolean = function(id, name, depth, schema) {
    this.renderLoopString(id, name, depth, schema);
};

/**
 * @memberOf Schema2Table
 * @description return a function adding a formOpenTag with a single callback that can be added to the control flow, or executed standalone
 *
 * @param {string} id
 * @param {string} endpoint
 * @param {string} method
 */

Schema2Table.prototype.addTableOpen = function(id, endpoint, method) {
    var _that = this,
        pos = this.pos;

    id = this.generateId(id);
    this.pos += 1;

    return function(callback) {
        _that.renderFormTag('tableOpen', id, endpoint, method, function(err, result) {
			if (err) {
				console.log(err);
				return;
			}
            _that.appendHtml(result, pos);
            _that.appendDummyHtml(result, pos);
            callback(err, result);
        });
    };
};

Schema2Table.prototype.addTableHeaderOpen = function(id, endpoint, method) {
    var _that = this,
        pos = this.pos;

    id = this.generateId(id);
    this.pos += 1;

    return function(callback) {
        _that.renderFormTag('tableHeaderOpen', id, endpoint, method, function(err, result) {
			if (err) {
				console.log(err);
				return;
			}
            _that.appendHtml(result, pos);
            _that.appendDummyHtml(result, pos);
            callback(err, result);
        });
    };
};

Schema2Table.prototype.addTableBodyOpen = function(id, endpoint, method) {
    var _that = this,
        pos = this.pos;

    id = this.generateId(id);
    this.pos += 1;

    return function(callback) {
        _that.renderFormTag('tableBodyOpen', id, endpoint, method, function(err, result) {
			if (err) {
				console.log(err);
				return;
			}
            _that.appendHtml(result, pos);
            _that.appendDummyHtml(result, pos);
            callback(err, result);
        });
    };
};




Schema2Table.prototype.addHeaderString = function(id, name, val, label, src, options, required) {
	var _that = this,
		pos = this.pos;

	this.pos += 1;

	return function(callback) {
		_that.renderHeaderString(id, name, val, label, src, options, required, function(err, result) {
			if (err) {
				console.log(err);
				return;
			}
			console.log("RESULT", result);
			_that.appendHtml(result, pos);
			//callback(err, result);
			_that.renderHeaderString(id, name, null, label, src, options, required, function(err, resultTwo) {
				_that.appendDummyHtml(resultTwo, pos);
				callback(err, result);
			});
		});


	};
};




Schema2Table.prototype.addTableRowOpen = function() {
    var _that = this,
        pos = this.pos;

	this.pos += 1;

    return function(callback) {
        _that.renderFormTag('tableRowOpen', null, null, null, function(err, result) {
			if (err) {
				console.log(err);
				return;
			}
            _that.appendHtml(result, pos);
            _that.appendDummyHtml(result, pos);
            callback(err, result);
        });
    };
};


/**
 * @memberOf Schema2Table
 * @description
 *
 * @param {string} dataRef
 */

Schema2Table.prototype.addAnyOfOpen = function(dataRef) {
    var _that = this,
        pos = this.pos;
    this.pos += 1;
    return function(callback) {
        _that.renderAnyOfOpenTag(dataRef, function(err, result) {
			if (err) {
				console.log(err);
				return;
			}
            _that.appendHtml(result, pos);
            _that.appendDummyHtml(result, pos);
            callback(err, result);
        });
    };
};

/**
 * @memberOf Schema2Table
 * @description
 *
 * @param {string} dataRef
 */

Schema2Table.prototype.addAnyOfClose = function(dataRef) {
    var _that = this,
        pos = this.pos;
    this.pos += 1;
    return function(callback) {
        _that.renderAnyOfCloseTag(dataRef, function(err, result) {
			if (err) {
				console.log(err);
				return;
			}
            _that.appendHtml(result, pos);
            _that.appendDummyHtml(result, pos);
            callback(err, result);
        });
    };
};

/**
 * @memberOf Schema2Table
 * @description
 *
 * @param {string} dataRef
 * @param {function} callback
 */

Schema2Table.prototype.renderAnyOfOpenTag = function(dataRef, callback) {
    var params = {
        dataRef: dataRef
    };



    this.renderTemplate('anyOfOpen', params, function(err, result) {
        callback(err, result);
    });

};

/**
 * @memberOf Schema2Table
 * @description
 *
 * @param {string} dataRef
 * @param {function} callback
 */

Schema2Table.prototype.renderAnyOfCloseTag = function(dataRef, callback) {
    var params = {
        dataRef: dataRef
    };

    this.renderTemplate('anyOfClose', params, function(err, result) {
        callback(err, result);
    });

};

/**
 * @memberOf Schema2Table
 * @description Renders the opening and closing tags
 *
 * @param {string[formOpen,formClose]} type specify if type is opening or closing
 * @param {number} id html id assigned to form
 * @param {string} form endpoint submission endpoint
 * @param {string} method http method
 * @param {callback}
 */

Schema2Table.prototype.renderFormTag = function(type, id, endpoint, method, callback) {
    var params = {};

    params.id = id;
    params.endpoint = endpoint;
    params.method = method;

    this.renderTemplate(type, params, function(err, result) {
        callback(err, result);
    });

};

/**
 * @memberOf Schema2Table
 * @description return a function adding a formCloseTag with a single callback that can be added to the control flow, or executed standalone
 */

Schema2Table.prototype.addTableClose = function() {
    var _that = this,
        pos = this.pos;

    this.pos += 1;

    return function(callback) {
        _that.renderFormTag('tableClose', null, null, null, function(err, result) {
			if (err) {
				console.log(err);
				return;
			}
            _that.appendHtml(result, pos);
            _that.appendDummyHtml(result, pos);
            callback(err, result);
        });
    };
};

Schema2Table.prototype.addTableRowClose = function() {
    var _that = this,
        pos = this.pos;

    this.pos += 1;

    return function(callback) {
        _that.renderFormTag('tableRowClose', null, null, null, function(err, result) {
			if (err) {
				console.log(err);
				return;
			}
            _that.appendHtml(result, pos);
            _that.appendDummyHtml(result, pos);
            callback(err, result);
        });
    };
};

Schema2Table.prototype.addTableHeaderClose = function() {
    var _that = this,
        pos = this.pos;

    this.pos += 1;

    return function(callback) {
        _that.renderFormTag('tableHeaderClose', null, null, null, function(err, result) {
			if (err) {
				console.log(err);
				return;
			}
            _that.appendHtml(result, pos);
            _that.appendDummyHtml(result, pos);
            callback(err, result);
        });
    };
};

Schema2Table.prototype.addTableBodyClose = function() {
    var _that = this,
        pos = this.pos;

    this.pos += 1;

    return function(callback) {
        _that.renderFormTag('tableBodyClose', null, null, null, function(err, result) {
			if (err) {
				console.log(err);
				return;
			}
            _that.appendHtml(result, pos);
            _that.appendDummyHtml(result, pos);
            callback(err, result);
        });
    };
};



/**
 * @memberOf Schema2Table
 * @description Renders a template based on a path of a given key in the configuration
 *
 * @param {string} key
 * @param {object} params
 * @param {callback} callback
 */

Schema2Table.prototype.renderTemplate = function(key, params, callback) {
    var result = null,
        template = null,
        _that = this;

    if (this.pack.templates[key] === undefined) {
        callback(new Error("Template has no valid path:" + key));
        return null; // exit this is not going to work
    }

    if (typeof (this.pack.templates[key]) !== 'function') {
        this.pack.loadTemplate(key, function(err, compiled) {
            if (err === null) {
                try {
                    _that.pack.templates[key] = compiled;
                   // result = compiled(params);
                    _that.pack.renderTemplate(compiled, params, function(pErr, pResult) {
                        callback(pErr, pResult);
                    });

                } catch (templateErr) {
                    callback(templateErr, result);
                }
            } else {
                callback(err, result);
            }

        });
    } else {
        template = this.pack.templates[key];
        _that.pack.renderTemplate(template, params, function(pErr, pResult) {
            callback(pErr, pResult);
        });
        //result = template(params);
        //callback(null, result);
    }
};

/**
 * @memberOf Schema2Table
 * @description changes a template path
 *
 * @param {string} key
 * @param {string} path
 */

Schema2Table.prototype.changeTemplate = function(key, path) {
    this.config.templates[key] = path;
};

Schema2Table.prototype.renderCustomHandler = function() {};

/**
 * @memberOf Schema2Table
 * @description render group tag open
 *
 * @param {string} id
 * @param {integer} total
 * @param {integer} depth
 */

Schema2Table.prototype.addGroupOpen = function(id, total, depth, options) {
    var _that = this,
        pos = this.pos;

    this.pos += 1;
    id = this.generateId(id);

    return function(callback) {
        _that.renderGroupOpen(id, total, depth, options, function(err, result) {
			if (err) {
				console.log(err);
				return;
			}
            _that.appendHtml(result, pos);
            _that.appendDummyHtml(result, pos);
            callback(err, result);
        });
    };
};

/**
 * @memberOf Schema2Table
 * @description render group tag open
 *
 * @param {string} id
 * @param {integer} total
 * @param {integer} depth
 * @param {function} callback
 */

Schema2Table.prototype.renderGroupOpen = function(id, total, depth, options, callback) {
    var params = {};

    //console.log(options);

    params.id = id;
    params.total = total || 0;
    params.options = options || {};
    params.options.depth = depth;

    this.renderTemplate('startGroup', params, function(err, result) {
        callback(err, result);
    });
};

/**
 * @memberOf Schema2Table
 * @description add group tag close
 *
 * @param {string} id
 * @param {integer} depth
 */

Schema2Table.prototype.addGroupClose = function(id, depth) {
    var _that = this,
        pos = this.pos,
        params = {
            id: id
        };

    params.options = {

        depth: depth
    };

    this.pos += 1;

    return function(callback) {
        _that.renderGroupClose(params, function(err, result) {
			if (err) {
				console.log(err);
				return;
			}
            _that.appendHtml(result, pos);
            _that.appendDummyHtml(result, pos);
            callback(err, result);
        });
    };
};

/**
 * @memberOf Schema2Table
 * @description render group tag close
 *
 * @param {object} params
 * @param {function} callback
 */

Schema2Table.prototype.renderGroupClose = function(params, callback) {
    this.renderTemplate('endGroup', params, function(err, result) {
        callback(err, result);
    });
};

/**
 * @memberOf Schema2Table
 * @description returns a render function for a open/close tag for generic groups
 *
 * @param {string} type
 * @param {string} id
 * @param {string} name
 * @param {integer} depth
 * @param {object} options
 */

Schema2Table.prototype.addGroupTag = function(type, id, name, depth, options) {
    var _that = this,
        pos = this.pos;

    id = this.generateId(id);

    options = options || {};
    options.key = util.dotSyntax(name);
    options.keyName = util.rawName(name);
    options.keyInner = util.innerName(name);
    options.arrayDepth = this.arrayLoopCount;
    this.pos += 1;

    return function(callback) {
        _that.renderGroupTag(id, name, depth, options, type, function(err, result) {
			if (err) {
				console.log(err);
				return;
			}
            _that.appendHtml(result, pos);
            _that.appendDummyHtml(result, pos);
            callback(err, result);
        });
    };
};

/**
 * @description renders are group open/close tag
 *
 * @param {string} id
 * @param {string} name
 * @param {integer} depth
 * @param {object} options
 * @param {string} type
 * @param {function} callback
 * 
 */

Schema2Table.prototype.renderGroupTag = function(id, name, depth, options, type, callback) {
    var params = {
        id: id,
        name: name,
        depth: depth,
        options: options || {}
    };

    params.options.depth = depth;

    this.renderTemplate(type, params, function(err, result) {
        callback(err, result);
    });
};

/**
 * @memberOf Schema2Table
 * @description Appends rendered html to the internal html variable
 *
 * @param {string} html
 * @param {integer} pos
 */

Schema2Table.prototype.appendHtml = function(html, pos) {
    this.html[pos] = html;

    //this.appendDummyHtml(html, pos);
};

/**
 * @memberOf Schema2Table
 * @description Append a string to the dummy html output
 */

Schema2Table.prototype.appendDummyHtml = function(html, pos) {
    this.htmlTemplate[pos] = html;
};

/**
 * @memberOf Schema2Table
 * @description return a function that renders string template based on input variables
 *
 * @param {string} id
 * @param {string} name
 * @param {*} val
 * @param {string} label
 * @param {array} src
 * @param {object} options
 * @param {boolean} required
 */

Schema2Table.prototype.addString = function(id, name, val, label, src, options, required) {
    var _that = this,
        pos = this.pos;

    this.pos += 1;

    return function(callback) {
        _that.renderString(id, name, val, label, src, options, required, function(err, result) {
			if (err) {
				console.log(err);
				return;
			}
            _that.appendHtml(result, pos);
            //callback(err, result);
            _that.renderString(id, name, null, label, src, options, required, function(err, resultTwo) {
                _that.appendDummyHtml(resultTwo, pos);
                callback(err, result);
            });
        });


    };
};


Schema2Table.prototype.addTableHeaderActions = function(id, name, val, label, src, options, required) {
    var _that = this,
        pos = this.pos;

    this.pos += 1;

    return function(callback) {
        _that.renderTableHeaderActions(id, name, val, label, src, options, required, function(err, result) {
			if (err) {
				console.log(err);
				return;
			}
            _that.appendHtml(result, pos);
			console.log("ANOTHER RESULT", result);
            //callback(err, result);
            _that.renderTableHeaderActions(id, name, null, label, src, options, required, function(err, resultTwo) {
                _that.appendDummyHtml(resultTwo, pos);
                callback(err, result);
            });
        });


    };
};


Schema2Table.prototype.addTableActions = function(id, name, val, label, src, options, required) {
    var _that = this,
        pos = this.pos;

    this.pos += 1;

    return function(callback) {
        _that.renderTableActions(id, name, val, label, src, options, required, function(err, result) {
			if (err) {
				console.log(err);
				return;
			}
            _that.appendHtml(result, pos);
            //callback(err, result);
            _that.renderTableActions(id, name, null, label, src, options, required, function(err, resultTwo) {
                _that.appendDummyHtml(resultTwo, pos);
                callback(err, result);
            });
        });


    };
};


Schema2Table.prototype.renderTableHeaderActions = function(id, name, val, label, src, options, required, callback) {
    var params = {},
		template = 'tableHeaderActions';

    params.id = this.generateId(id);
    params.name = name;
    params.val = val;
    params.src = src;
    params.label = label;
    params.options = options || {};
    params.required = required || false;
    params.options.keyName = util.rawName(name);
    params.options.keyInner = util.innerName(name, params.options.depth || 0);
    params.options.arrayDepth = this.arrayLoopCount;
    params.datasrc = params.options.datasrc ? this.dependencyCache[params.options.datasrc] : null;

    template = params.options.format || template;

	console.log("RENDERING ACTIONS", this);

    this.renderTemplate(template, params, function(err, result) {
        callback(err, result);
    });

};

Schema2Table.prototype.renderTableActions = function(id, name, val, label, src, options, required, callback) {
    var params = {},
		template = 'tableActions';

    params.id = this.generateId(id);
    params.name = name;
    params.val = val;
    params.src = src;
    params.label = label;
    params.options = options || {};
    params.required = required || false;
    params.options.keyName = util.rawName(name);
    params.options.keyInner = util.innerName(name, params.options.depth || 0);
    params.options.arrayDepth = this.arrayLoopCount;
    params.datasrc = params.options.datasrc ? this.dependencyCache[params.options.datasrc] : null;

    template = params.options.format || template;

    this.renderTemplate(template, params, function(err, result) {
        callback(err, result);
    });

};


/**
 * @memberOf Schema2Table
 * @description Render string template
 *
 * @param {string} id
 * @param {string} name
 * @param {*} val
 * @param {string} label
 * @param {array} src
 * @param {object} options
 * @param {boolean} required
 * @param {function} callback
 */

Schema2Table.prototype.renderString = function(id, name, val, label, src, options, required, callback) {
    var params = {},
        template = 'tableItem';

    params.id = this.generateId(id);
    params.name = name;
    params.val = val;
    params.src = src;
    params.label = label;
    params.options = options || {};
    params.required = required || false;
    params.options.keyName = util.rawName(name);
    params.options.keyInner = util.innerName(name, params.options.depth || 0);
    params.options.arrayDepth = this.arrayLoopCount;
    params.datasrc = params.options.datasrc ? this.dependencyCache[params.options.datasrc] : null;

    template = params.options.format || template;

    this.renderTemplate(template, params, function(err, result) {
        callback(err, result);
    });
};


Schema2Table.prototype.renderHeaderString = function(id, name, val, label, src, options, required, callback) {
    var params = {},
        template = 'tableHeader';

    params.id = this.generateId(id);
    params.name = name;
    params.val = val;
    params.src = src;
    params.label = label;
    params.options = options || {};
    params.required = required || false;
    params.options.keyName = util.rawName(name);
    params.options.keyInner = util.innerName(name, params.options.depth || 0);
    params.options.arrayDepth = this.arrayLoopCount;
    params.datasrc = params.options.datasrc ? this.dependencyCache[params.options.datasrc] : null;

    template = params.options.format || template;

    this.renderTemplate(template, params, function(err, result) {
        callback(err, result);
    });
};


/**
 * @memberOf Schema2Table
 * @description Push a task into what will make up the rendering loop
 *
 * @param {function} func
 */

Schema2Table.prototype.addRenderTask = function(func) {
	//this.funcs.push(function(callback) {
		//func();
		//callback();
	//});
	this.funcs.push(func);
};

/**
 * @memberOf Schema2Table
 * @description Generate a valid html id for use in the dom
 *
 * @param {string} scope
 */

Schema2Table.prototype.generateId = function(scope) {
    scope = scope || "";
    return scope !== null ? scope.toLowerCase().split('../').join('-@-').split('[').join('--').split(']').join('').split('.').join('-').split(' ').join('-').split('-@-').join('../') : null;
};

/**
 * @memberOf Schema2Table
 * @description Genetate a valid form name
 *
 * @param {string} preScope
 * @param {string} newScope
 * 
 */

Schema2Table.prototype.generateName = function(preScope, newScope) {
    var name;

    if (preScope !== null) {
        name =  preScope + '[' + newScope + ']';
    } else {
        name = newScope;
    }

    return name;
};


module.exports = Schema2Table;
