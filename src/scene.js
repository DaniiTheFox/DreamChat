// *****************************************************************
// * IMPORTING THE LIBRARIES, CONSIDER THIS DOES NOT PROPERLY WORK *
// *****************************************************************
//
import * as THREE from '/node_modules/three/build/three.module.js';

// ---------------------------------------------------------------------------------------
// - THESE ARE LIBRARIES THAT COULDN'T GET IMPORTED, PLEASE JUMP TO LINE 967 TO CONTINUE -
// ---------------------------------------------------------------------------------------
var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var DEFAULT_VALUES = {
    emitDelay: 10,
    strictMode: false
};

/**
 * @typedef {object} EventEmitterListenerFunc
 * @property {boolean} once
 * @property {function} fn
 */

/**
 * @class EventEmitter
 *
 * @private
 * @property {Object.<string, EventEmitterListenerFunc[]>} _listeners
 * @property {string[]} events
 */
var OBJLoader = ( function () {

	// o object_name | g group_name
	var object_pattern = /^[og]\s*(.+)?/;
	// mtllib file_reference
	var material_library_pattern = /^mtllib /;
	// usemtl material_name
	var material_use_pattern = /^usemtl /;

	function ParserState() {

		var state = {
			objects: [],
			object: {},

			vertices: [],
			normals: [],
			colors: [],
			uvs: [],

			materialLibraries: [],

			startObject: function ( name, fromDeclaration ) {

				// If the current object (initial from reset) is not from a g/o declaration in the parsed
				// file. We need to use it for the first parsed g/o to keep things in sync.
				if ( this.object && this.object.fromDeclaration === false ) {

					this.object.name = name;
					this.object.fromDeclaration = ( fromDeclaration !== false );
					return;

				}

				var previousMaterial = ( this.object && typeof this.object.currentMaterial === 'function' ? this.object.currentMaterial() : undefined );

				if ( this.object && typeof this.object._finalize === 'function' ) {

					this.object._finalize( true );

				}

				this.object = {
					name: name || '',
					fromDeclaration: ( fromDeclaration !== false ),

					geometry: {
						vertices: [],
						normals: [],
						colors: [],
						uvs: []
					},
					materials: [],
					smooth: true,

					startMaterial: function ( name, libraries ) {

						var previous = this._finalize( false );

						// New usemtl declaration overwrites an inherited material, except if faces were declared
						// after the material, then it must be preserved for proper MultiMaterial continuation.
						if ( previous && ( previous.inherited || previous.groupCount <= 0 ) ) {

							this.materials.splice( previous.index, 1 );

						}

						var material = {
							index: this.materials.length,
							name: name || '',
							mtllib: ( Array.isArray( libraries ) && libraries.length > 0 ? libraries[ libraries.length - 1 ] : '' ),
							smooth: ( previous !== undefined ? previous.smooth : this.smooth ),
							groupStart: ( previous !== undefined ? previous.groupEnd : 0 ),
							groupEnd: - 1,
							groupCount: - 1,
							inherited: false,

							clone: function ( index ) {

								var cloned = {
									index: ( typeof index === 'number' ? index : this.index ),
									name: this.name,
									mtllib: this.mtllib,
									smooth: this.smooth,
									groupStart: 0,
									groupEnd: - 1,
									groupCount: - 1,
									inherited: false
								};
								cloned.clone = this.clone.bind( cloned );
								return cloned;

							}
						};

						this.materials.push( material );

						return material;

					},

					currentMaterial: function () {

						if ( this.materials.length > 0 ) {

							return this.materials[ this.materials.length - 1 ];

						}

						return undefined;

					},

					_finalize: function ( end ) {

						var lastMultiMaterial = this.currentMaterial();
						if ( lastMultiMaterial && lastMultiMaterial.groupEnd === - 1 ) {

							lastMultiMaterial.groupEnd = this.geometry.vertices.length / 3;
							lastMultiMaterial.groupCount = lastMultiMaterial.groupEnd - lastMultiMaterial.groupStart;
							lastMultiMaterial.inherited = false;

						}

						// Ignore objects tail materials if no face declarations followed them before a new o/g started.
						if ( end && this.materials.length > 1 ) {

							for ( var mi = this.materials.length - 1; mi >= 0; mi -- ) {

								if ( this.materials[ mi ].groupCount <= 0 ) {

									this.materials.splice( mi, 1 );

								}

							}

						}

						// Guarantee at least one empty material, this makes the creation later more straight forward.
						if ( end && this.materials.length === 0 ) {

							this.materials.push( {
								name: '',
								smooth: this.smooth
							} );

						}

						return lastMultiMaterial;

					}
				};

				// Inherit previous objects material.
				// Spec tells us that a declared material must be set to all objects until a new material is declared.
				// If a usemtl declaration is encountered while this new object is being parsed, it will
				// overwrite the inherited material. Exception being that there was already face declarations
				// to the inherited material, then it will be preserved for proper MultiMaterial continuation.

				if ( previousMaterial && previousMaterial.name && typeof previousMaterial.clone === 'function' ) {

					var declared = previousMaterial.clone( 0 );
					declared.inherited = true;
					this.object.materials.push( declared );

				}

				this.objects.push( this.object );

			},

			finalize: function () {

				if ( this.object && typeof this.object._finalize === 'function' ) {

					this.object._finalize( true );

				}

			},

			parseVertexIndex: function ( value, len ) {

				var index = parseInt( value, 10 );
				return ( index >= 0 ? index - 1 : index + len / 3 ) * 3;

			},

			parseNormalIndex: function ( value, len ) {

				var index = parseInt( value, 10 );
				return ( index >= 0 ? index - 1 : index + len / 3 ) * 3;

			},

			parseUVIndex: function ( value, len ) {

				var index = parseInt( value, 10 );
				return ( index >= 0 ? index - 1 : index + len / 2 ) * 2;

			},

			addVertex: function ( a, b, c ) {

				var src = this.vertices;
				var dst = this.object.geometry.vertices;

				dst.push( src[ a + 0 ], src[ a + 1 ], src[ a + 2 ] );
				dst.push( src[ b + 0 ], src[ b + 1 ], src[ b + 2 ] );
				dst.push( src[ c + 0 ], src[ c + 1 ], src[ c + 2 ] );

			},

			addVertexLine: function ( a ) {

				var src = this.vertices;
				var dst = this.object.geometry.vertices;

				dst.push( src[ a + 0 ], src[ a + 1 ], src[ a + 2 ] );

			},

			addNormal: function ( a, b, c ) {

				var src = this.normals;
				var dst = this.object.geometry.normals;

				dst.push( src[ a + 0 ], src[ a + 1 ], src[ a + 2 ] );
				dst.push( src[ b + 0 ], src[ b + 1 ], src[ b + 2 ] );
				dst.push( src[ c + 0 ], src[ c + 1 ], src[ c + 2 ] );

			},

			addColor: function ( a, b, c ) {

				var src = this.colors;
				var dst = this.object.geometry.colors;

				dst.push( src[ a + 0 ], src[ a + 1 ], src[ a + 2 ] );
				dst.push( src[ b + 0 ], src[ b + 1 ], src[ b + 2 ] );
				dst.push( src[ c + 0 ], src[ c + 1 ], src[ c + 2 ] );

			},

			addUV: function ( a, b, c ) {

				var src = this.uvs;
				var dst = this.object.geometry.uvs;

				dst.push( src[ a + 0 ], src[ a + 1 ] );
				dst.push( src[ b + 0 ], src[ b + 1 ] );
				dst.push( src[ c + 0 ], src[ c + 1 ] );

			},

			addUVLine: function ( a ) {

				var src = this.uvs;
				var dst = this.object.geometry.uvs;

				dst.push( src[ a + 0 ], src[ a + 1 ] );

			},

			addFace: function ( a, b, c, ua, ub, uc, na, nb, nc ) {

				var vLen = this.vertices.length;

				var ia = this.parseVertexIndex( a, vLen );
				var ib = this.parseVertexIndex( b, vLen );
				var ic = this.parseVertexIndex( c, vLen );

				this.addVertex( ia, ib, ic );

				if ( ua !== undefined ) {

					var uvLen = this.uvs.length;

					ia = this.parseUVIndex( ua, uvLen );
					ib = this.parseUVIndex( ub, uvLen );
					ic = this.parseUVIndex( uc, uvLen );

					this.addUV( ia, ib, ic );

				}

				if ( na !== undefined ) {

					// Normals are many times the same. If so, skip function call and parseInt.
					var nLen = this.normals.length;
					ia = this.parseNormalIndex( na, nLen );

					ib = na === nb ? ia : this.parseNormalIndex( nb, nLen );
					ic = na === nc ? ia : this.parseNormalIndex( nc, nLen );

					this.addNormal( ia, ib, ic );

				}

				if ( this.colors.length > 0 ) {

					this.addColor( ia, ib, ic );

				}

			},

			addLineGeometry: function ( vertices, uvs ) {

				this.object.geometry.type = 'Line';

				var vLen = this.vertices.length;
				var uvLen = this.uvs.length;

				for ( var vi = 0, l = vertices.length; vi < l; vi ++ ) {

					this.addVertexLine( this.parseVertexIndex( vertices[ vi ], vLen ) );

				}

				for ( var uvi = 0, l = uvs.length; uvi < l; uvi ++ ) {

					this.addUVLine( this.parseUVIndex( uvs[ uvi ], uvLen ) );

				}

			}

		};

		state.startObject( '', false );

		return state;

	}

	//

	function OBJLoader( manager ) {

		this.manager = ( manager !== undefined ) ? manager : THREE.DefaultLoadingManager;

		this.materials = null;

	}

	OBJLoader.prototype = {

		constructor: OBJLoader,

		load: function ( url, onLoad, onProgress, onError ) {

			var scope = this;

			var loader = new THREE.FileLoader( scope.manager );
			loader.setPath( this.path );
			loader.load( url, function ( text ) {

				onLoad( scope.parse( text ) );

			}, onProgress, onError );

		},

		setPath: function ( value ) {

			this.path = value;

		},

		setMaterials: function ( materials ) {

			this.materials = materials;

			return this;

		},

		parse: function ( text ) {

			console.time( 'OBJLoader' );

			var state = new ParserState();

			if ( text.indexOf( '\r\n' ) !== - 1 ) {

				// This is faster than String.split with regex that splits on both
				text = text.replace( /\r\n/g, '\n' );

			}

			if ( text.indexOf( '\\\n' ) !== - 1 ) {

				// join lines separated by a line continuation character (\)
				text = text.replace( /\\\n/g, '' );

			}

			var lines = text.split( '\n' );
			var line = '', lineFirstChar = '';
			var lineLength = 0;
			var result = [];

			// Faster to just trim left side of the line. Use if available.
			var trimLeft = ( typeof ''.trimLeft === 'function' );

			for ( var i = 0, l = lines.length; i < l; i ++ ) {

				line = lines[ i ];

				line = trimLeft ? line.trimLeft() : line.trim();

				lineLength = line.length;

				if ( lineLength === 0 ) continue;

				lineFirstChar = line.charAt( 0 );

				// @todo invoke passed in handler if any
				if ( lineFirstChar === '#' ) continue;

				if ( lineFirstChar === 'v' ) {

					var data = line.split( /\s+/ );

					switch ( data[ 0 ] ) {

						case 'v':
							state.vertices.push(
								parseFloat( data[ 1 ] ),
								parseFloat( data[ 2 ] ),
								parseFloat( data[ 3 ] )
							);
							if ( data.length === 8 ) {

								state.colors.push(
									parseFloat( data[ 4 ] ),
									parseFloat( data[ 5 ] ),
									parseFloat( data[ 6 ] )

								);

							}
							break;
						case 'vn':
							state.normals.push(
								parseFloat( data[ 1 ] ),
								parseFloat( data[ 2 ] ),
								parseFloat( data[ 3 ] )
							);
							break;
						case 'vt':
							state.uvs.push(
								parseFloat( data[ 1 ] ),
								parseFloat( data[ 2 ] )
							);
							break;

					}

				} else if ( lineFirstChar === 'f' ) {

					var lineData = line.substr( 1 ).trim();
					var vertexData = lineData.split( /\s+/ );
					var faceVertices = [];

					// Parse the face vertex data into an easy to work with format

					for ( var j = 0, jl = vertexData.length; j < jl; j ++ ) {

						var vertex = vertexData[ j ];

						if ( vertex.length > 0 ) {

							var vertexParts = vertex.split( '/' );
							faceVertices.push( vertexParts );

						}

					}

					// Draw an edge between the first vertex and all subsequent vertices to form an n-gon

					var v1 = faceVertices[ 0 ];

					for ( var j = 1, jl = faceVertices.length - 1; j < jl; j ++ ) {

						var v2 = faceVertices[ j ];
						var v3 = faceVertices[ j + 1 ];

						state.addFace(
							v1[ 0 ], v2[ 0 ], v3[ 0 ],
							v1[ 1 ], v2[ 1 ], v3[ 1 ],
							v1[ 2 ], v2[ 2 ], v3[ 2 ]
						);

					}

				} else if ( lineFirstChar === 'l' ) {

					var lineParts = line.substring( 1 ).trim().split( " " );
					var lineVertices = [], lineUVs = [];

					if ( line.indexOf( "/" ) === - 1 ) {

						lineVertices = lineParts;

					} else {

						for ( var li = 0, llen = lineParts.length; li < llen; li ++ ) {

							var parts = lineParts[ li ].split( "/" );

							if ( parts[ 0 ] !== "" ) lineVertices.push( parts[ 0 ] );
							if ( parts[ 1 ] !== "" ) lineUVs.push( parts[ 1 ] );

						}

					}
					state.addLineGeometry( lineVertices, lineUVs );

				} else if ( ( result = object_pattern.exec( line ) ) !== null ) {

					// o object_name
					// or
					// g group_name

					// WORKAROUND: https://bugs.chromium.org/p/v8/issues/detail?id=2869
					// var name = result[ 0 ].substr( 1 ).trim();
					var name = ( " " + result[ 0 ].substr( 1 ).trim() ).substr( 1 );

					state.startObject( name );

				} else if ( material_use_pattern.test( line ) ) {

					// material

					state.object.startMaterial( line.substring( 7 ).trim(), state.materialLibraries );

				} else if ( material_library_pattern.test( line ) ) {

					// mtl file

					state.materialLibraries.push( line.substring( 7 ).trim() );

				} else if ( lineFirstChar === 's' ) {

					result = line.split( ' ' );

					// smooth shading

					// @todo Handle files that have varying smooth values for a set of faces inside one geometry,
					// but does not define a usemtl for each face set.
					// This should be detected and a dummy material created (later MultiMaterial and geometry groups).
					// This requires some care to not create extra material on each smooth value for "normal" obj files.
					// where explicit usemtl defines geometry groups.
					// Example asset: examples/models/obj/cerberus/Cerberus.obj

					/*
					 * http://paulbourke.net/dataformats/obj/
					 * or
					 * http://www.cs.utah.edu/~boulos/cs3505/obj_spec.pdf
					 *
					 * From chapter "Grouping" Syntax explanation "s group_number":
					 * "group_number is the smoothing group number. To turn off smoothing groups, use a value of 0 or off.
					 * Polygonal elements use group numbers to put elements in different smoothing groups. For free-form
					 * surfaces, smoothing groups are either turned on or off; there is no difference between values greater
					 * than 0."
					 */
					if ( result.length > 1 ) {

						var value = result[ 1 ].trim().toLowerCase();
						state.object.smooth = ( value !== '0' && value !== 'off' );

					} else {

						// ZBrush can produce "s" lines #11707
						state.object.smooth = true;

					}
					var material = state.object.currentMaterial();
					if ( material ) material.smooth = state.object.smooth;

				} else {

					// Handle null terminated files without exception
					if ( line === '\0' ) continue;

					throw new Error( 'THREE.OBJLoader: Unexpected line: "' + line + '"' );

				}

			}

			state.finalize();

			var container = new THREE.Group();
			container.materialLibraries = [].concat( state.materialLibraries );

			for ( var i = 0, l = state.objects.length; i < l; i ++ ) {

				var object = state.objects[ i ];
				var geometry = object.geometry;
				var materials = object.materials;
				var isLine = ( geometry.type === 'Line' );

				// Skip o/g line declarations that did not follow with any faces
				if ( geometry.vertices.length === 0 ) continue;

				var buffergeometry = new THREE.BufferGeometry();

				buffergeometry.addAttribute( 'position', new THREE.Float32BufferAttribute( geometry.vertices, 3 ) );

				if ( geometry.normals.length > 0 ) {

					buffergeometry.addAttribute( 'normal', new THREE.Float32BufferAttribute( geometry.normals, 3 ) );

				} else {

					buffergeometry.computeVertexNormals();

				}

				if ( geometry.colors.length > 0 ) {

					buffergeometry.addAttribute( 'color', new THREE.Float32BufferAttribute( geometry.colors, 3 ) );

				}

				if ( geometry.uvs.length > 0 ) {

					buffergeometry.addAttribute( 'uv', new THREE.Float32BufferAttribute( geometry.uvs, 2 ) );

				}

				// Create materials

				var createdMaterials = [];

				for ( var mi = 0, miLen = materials.length; mi < miLen; mi ++ ) {

					var sourceMaterial = materials[ mi ];
					var material = undefined;

					if ( this.materials !== null ) {

						material = this.materials.create( sourceMaterial.name );

						// mtl etc. loaders probably can't create line materials correctly, copy properties to a line material.
						if ( isLine && material && ! ( material instanceof THREE.LineBasicMaterial ) ) {

							var materialLine = new THREE.LineBasicMaterial();
							materialLine.copy( material );
							material = materialLine;

						}

					}

					if ( ! material ) {

						material = ( ! isLine ? new THREE.MeshPhongMaterial() : new THREE.LineBasicMaterial() );
						material.name = sourceMaterial.name;

					}

					material.flatShading = sourceMaterial.smooth ? false : true;

					createdMaterials.push( material );

				}

				// Create mesh

				var mesh;

				if ( createdMaterials.length > 1 ) {

					for ( var mi = 0, miLen = materials.length; mi < miLen; mi ++ ) {

						var sourceMaterial = materials[ mi ];
						buffergeometry.addGroup( sourceMaterial.groupStart, sourceMaterial.groupCount, mi );

					}

					mesh = ( ! isLine ? new THREE.Mesh( buffergeometry, createdMaterials ) : new THREE.LineSegments( buffergeometry, createdMaterials ) );

				} else {

					mesh = ( ! isLine ? new THREE.Mesh( buffergeometry, createdMaterials[ 0 ] ) : new THREE.LineSegments( buffergeometry, createdMaterials[ 0 ] ) );

				}

				mesh.name = object.name;

				container.add( mesh );

			}

			console.timeEnd( 'OBJLoader' );

			return container;

		}

	};

	return OBJLoader;

} )();

var EventEmitter = function () {

    /**
     * @constructor
     * @param {{}}      [opts]
     * @param {number}  [opts.emitDelay = 10] - Number in ms. Specifies whether emit will be sync or async. By default - 10ms. If 0 - fires sync
     * @param {boolean} [opts.strictMode = false] - is true, Emitter throws error on emit error with no listeners
     */

    function EventEmitter() {
        var opts = arguments.length <= 0 || arguments[0] === undefined ? DEFAULT_VALUES : arguments[0];

        _classCallCheck(this, EventEmitter);

        var emitDelay = void 0,
            strictMode = void 0;

        if (opts.hasOwnProperty('emitDelay')) {
            emitDelay = opts.emitDelay;
        } else {
            emitDelay = DEFAULT_VALUES.emitDelay;
        }
        this._emitDelay = emitDelay;

        if (opts.hasOwnProperty('strictMode')) {
            strictMode = opts.strictMode;
        } else {
            strictMode = DEFAULT_VALUES.strictMode;
        }
        this._strictMode = strictMode;

        this._listeners = {};
        this.events = [];
    }

    /**
     * @protected
     * @param {string} type
     * @param {function} listener
     * @param {boolean} [once = false]
     */


    _createClass(EventEmitter, [{
        key: '_addListenner',
        value: function _addListenner(type, listener, once) {
            if (typeof listener !== 'function') {
                throw TypeError('listener must be a function');
            }

            if (this.events.indexOf(type) === -1) {
                this._listeners[type] = [{
                    once: once,
                    fn: listener
                }];
                this.events.push(type);
            } else {
                this._listeners[type].push({
                    once: once,
                    fn: listener
                });
            }
        }

        /**
         * Subscribes on event type specified function
         * @param {string} type
         * @param {function} listener
         */

    }, {
        key: 'on',
        value: function on(type, listener) {
            this._addListenner(type, listener, false);
        }

        /**
         * Subscribes on event type specified function to fire only once
         * @param {string} type
         * @param {function} listener
         */

    }, {
        key: 'once',
        value: function once(type, listener) {
            this._addListenner(type, listener, true);
        }

        /**
         * Removes event with specified type. If specified listenerFunc - deletes only one listener of specified type
         * @param {string} eventType
         * @param {function} [listenerFunc]
         */

    }, {
        key: 'off',
        value: function off(eventType, listenerFunc) {
            var _this = this;

            var typeIndex = this.events.indexOf(eventType);
            var hasType = eventType && typeIndex !== -1;

            if (hasType) {
                if (!listenerFunc) {
                    delete this._listeners[eventType];
                    this.events.splice(typeIndex, 1);
                } else {
                    (function () {
                        var removedEvents = [];
                        var typeListeners = _this._listeners[eventType];

                        typeListeners.forEach(
                        /**
                         * @param {EventEmitterListenerFunc} fn
                         * @param {number} idx
                         */
                        function (fn, idx) {
                            if (fn.fn === listenerFunc) {
                                removedEvents.unshift(idx);
                            }
                        });

                        removedEvents.forEach(function (idx) {
                            typeListeners.splice(idx, 1);
                        });

                        if (!typeListeners.length) {
                            _this.events.splice(typeIndex, 1);
                            delete _this._listeners[eventType];
                        }
                    })();
                }
            }
        }

        /**
         * Applies arguments to specified event type
         * @param {string} eventType
         * @param {*[]} eventArguments
         * @protected
         */

    }, {
        key: '_applyEvents',
        value: function _applyEvents(eventType, eventArguments) {
            var typeListeners = this._listeners[eventType];

            if (!typeListeners || !typeListeners.length) {
                if (this._strictMode) {
                    throw 'No listeners specified for event: ' + eventType;
                } else {
                    return;
                }
            }

            var removableListeners = [];
            typeListeners.forEach(function (eeListener, idx) {
                eeListener.fn.apply(null, eventArguments);
                if (eeListener.once) {
                    removableListeners.unshift(idx);
                }
            });

            removableListeners.forEach(function (idx) {
                typeListeners.splice(idx, 1);
            });
        }

        /**
         * Emits event with specified type and params.
         * @param {string} type
         * @param eventArgs
         */

    }, {
        key: 'emit',
        value: function emit(type) {
            var _this2 = this;

            for (var _len = arguments.length, eventArgs = Array(_len > 1 ? _len - 1 : 0), _key = 1; _key < _len; _key++) {
                eventArgs[_key - 1] = arguments[_key];
            }

            if (this._emitDelay) {
                setTimeout(function () {
                    _this2._applyEvents.call(_this2, type, eventArgs);
                }, this._emitDelay);
            } else {
                this._applyEvents(type, eventArgs);
            }
        }

        /**
         * Emits event with specified type and params synchronously.
         * @param {string} type
         * @param eventArgs
         */

    }, {
        key: 'emitSync',
        value: function emitSync(type) {
            for (var _len2 = arguments.length, eventArgs = Array(_len2 > 1 ? _len2 - 1 : 0), _key2 = 1; _key2 < _len2; _key2++) {
                eventArgs[_key2 - 1] = arguments[_key2];
            }

            this._applyEvents(type, eventArgs);
        }

        /**
         * Destroys EventEmitter
         */

    }, {
        key: 'destroy',
        value: function destroy() {
            this._listeners = {};
            this.events = [];
        }
    }]);

    return EventEmitter;
}();

// ------------------------------------------------------------------------------------------
// *****************************************************************
// * DEFINE THE GLOBAL VARIABLES FOR INSIDE AND OUTSIDE THE OBJECT *
// *****************************************************************
// ------------------------------------------------------------------------------------------
var interactive_obj = [];       // THIS IS THE ARRAY THAT STORES THE INTERACTIVE ITEMS
var map_name = "";              // THIS STORES THE MAP NAMES
var descript = "";              // THIS IS THE WORLD DESCRIPTION
var world_map_build = true;     // TEST IF HAS BUILD PERMISSIONS
var is_able_to_build = false;   // AGAIN REVIEW IF HAS BUILDING PERM
var is_using_perlinm = false;   // TEST IF WORLD USES PERLIN NOISE
var perlin_distancer = 0;       // DEFINE THE DISTANCE OF PERLIN NOISE
var has_a_world_map_ = true;    // TEST IF HAS A WORLD 3D MODEL IN OBJ FORMAT
var _3d_floor_size_ = 100;      // SIZE OF THE FLOOR (WORLD) IMPLEMENTED
var _3d_floor_text_ = "";       // DEFINE A TEXTURE FOR THE WORLD FLOOR
var _3d_world_model_ = "";      // DEFINE THE LINK TO THE OBJ MODEL OF THE WORLD
var _world_material_ = "";      // DEFINE THE LINK TO THE MATERIAL OF THE WORLD
var world_fog_color_ = [];      // GET THE FOG COLOR FROM THE WORLD
var world_has_fog_en = false;   // GET IF THE WORLD HAS FOG ENABLED
var _wrl_water_level = -1;      // WATER LEVEL (UNUSED AT THE MOMENT)
var _world_particles = false;   // GET THE WORLD PARTICLES (DISABLED ATM)
var wrl_particle_tex = [];      // GET WHICH PARTICLES ARE ENABLED AND WHERE
var d_world_map      = [];      // DUE TO ASYNC SHIT THESE MUST BE GLOBAL
var wrl_interactives = [];      // DEFINE INTERACTIVE ITEMS OF THE WORLD
var spawn_point      = [];      // DEFINE THE SPAWN POINT
var can_int          = false;   // TEST IF WORLD HAS ALREADY BEEN LOADED.

// ------------------------------------------------------------------------------------------
// ****************************************************************
// * THIS IS THE EVENT EMITTER, WHERE THE ENTIRE SCENE IS CREATED *
// ****************************************************************
// ------------------------------------------------------------------------------------------
class Scene extends EventEmitter {                                // EVERYTHING IS AN OBJECT
  constructor(domElement = document.getElementById('gl_context'), // LET'S START BY CREATING THE WEBGL CONTEXT
              _width = window.innerWidth,                         // DEFINE THE WINDOW SIZE X
              _height = window.innerHeight,                       // AND WINDOW SIZE Y 
              hasControls = true,                                 // CONFIGURE THE COLORS ENABLED
              clearColor = 'black'){                              // AND DEFINE A COLOR FOR THE BASE

    //Since we extend EventEmitter we need to instance it from here
    super();
    
    // -------------------------------------------------------------------------------------------------
    // - . + * THIS IS THE CONFIGURATION PART IT IS THE MOST IMPORTANT PART IN CUSTOMIZATION!!!! * + . -
    // -------------------------------------------------------------------------------------------------
    var region_map_file = "/world-data/mainland.json";
    // -------------------------------------------------------------------------------------------------
    this.tmp2_vec = new THREE.Vector3();        // 
    this.pointer = new THREE.Vector2();         // NOW IN THIS PART WE ARE GOING TO DEFINE THE BASE
    this.raycaster = new THREE.Raycaster();     // OBJECTS REQUIRED FOR THE SCENE AND FOR TEMPORAL
    this.rollOverMesh;                          // OPERATIONS LATER ON IN THE GAME
    this.rollOverMaterial;                      // AS THE INTERACTIVE ITEMS
    this.box_objects = [];                      // AND THE SCENE CREATION
    this.scene = new THREE.Scene();             // 
    // --------------------------------------------
    var getJSON = function(url, callback) { // 
        var xhr = new XMLHttpRequest();     // THIS IS A CORS BYPASS
        xhr.open('GET', url, true);         // AS THE JSON MUST BE FOUND BEFORE THE PROGRAM STARTS AND INTERPRETED
        xhr.responseType = 'json';          // DURING THE ASYNC OPERATIONS OF THREEJS
        xhr.onload = function() {           // 
          var status = xhr.status;          // 
          if (status === 200) {             // 
            callback(null, xhr.response);   // 
          } else {                          // 
            callback(status, xhr.response); // 
          }                                 // 
        };                                  // 
        xhr.send();                         // 
    };
    // ----------------------------------------------
    getJSON( region_map_file,
        function(err, data) {
        if (err !== null) {
            alert('Something went wrong: ' + err);
        } else {
            //alert('Your query count: ' + data.query.count);
            //console.log(data.mapname);
            //this.is_able_to_build = data.can_build;
            //d_world_map = data.worldmap;
            map_name = data.mapname; 
            descript = data.Description;
            is_able_to_build = data.can_build;
            //is_using_perlinm = data.is_perlin;
            //perlin_distancer = data.perl_dist;
            has_a_world_map_ = data.world_mp;
            _3d_world_model_ = data.worldmdl;
            _world_material_ = data.worldmtl;
            world_fog_color_ = data.worldfog;
            world_has_fog_en = data.has_fog;
            //_wrl_water_level = data.water_lvl;
            _world_particles = data.has_part;
            wrl_particle_tex = data.particle;
            d_world_map      = data.worldmap;
            wrl_interactives = data.interactive;
            spawn_point      = data.u_spawns;
            _3d_floor_size_ = data.floor_size;
            _3d_floor_text_ = data.floor_tex;
            //console.log(d_world_map);
            can_int = true;
        }
    });
    // ------------------------------------
    // - SOME UTILITIES FUNCTIONS IN HERE -
    // ------------------------------------
    function romveFunction(inputString) {
		if (!inputString) return null;
        return inputString.replace(/./g, char => {
            if (/[a-zA-Z0-9 ]/.test(char)) {
                return char;
            }
            return '';
        });
    }
    // -------------------------------------------------------
    // - THIS IS THE ACCOUNT SYSTEM AND PLAYER CUSTOMIZATION -
    // -------------------------------------------------------
    function findGetParameter(parameterName) {
        var result = null,
            tmp = [];
        var items = location.search.substr(1).split("&");
        for (var index = 0; index < items.length; index++) {
            tmp = items[index].split("=");
            if (tmp[0] === parameterName) result = decodeURIComponent(tmp[1]);
        }
        return result;
    }
    // -------------------------------------------
    this.client_username = romveFunction(findGetParameter("WOLFname"));
	this.client_obj_mdl  = romveFunction(findGetParameter("mymdl")); // My Model
	this.client_obj_mat  = romveFunction(findGetParameter("mymtl")); // My Material
    //console.log("hello! " + this.client_username);

	if (!this.client_username || !this.client_obj_mdl || !this.client_obj_mat) {
    	// Redirect if any parameter is missing
    	window.location.href = "/index.html"; // Replace with your desired error/redirect page
	} else {
    	// Set cookies
    	document.cookie = "playermodel=" + this.client_obj_mdl; // Load the client model on a cookie
    	document.cookie = "playermats="  + this.client_obj_mat; // Load the client texture on a cookie
    	document.cookie = "username="   + this.client_username; // Load the username on a cookie
	}
    // -------------------------------------------
    // - TEXTURE INITIALIZATION PART GOES HERE   -
    // -------------------------------------------
    this.spr_other_a_char   = new THREE.TextureLoader().load( "/resources/sprite_wolf.png" ); // animated
    this.spr_animated_char  = new THREE.TextureLoader().load( "/resources/sprite_wolf.png" );
    this.default_char       = new THREE.TextureLoader().load( "/resources/default.png" );
    this.background_texture = new THREE.TextureLoader().load( "/resources/water.png" );
    this.ground_texture     = new THREE.TextureLoader().load( "/resources/grass.png" );
    this.torch_texture     = new THREE.TextureLoader().load( "/resources/torch.png" );
    this.tree_texture     = new THREE.TextureLoader().load( "/resources/tree.png" );
    // --------------------------------------------
    // - WORLD PREFABRICATED OBJECTS WILL GO HERE -
    // --------------------------------------------
    
    this.torch_material = new THREE.SpriteMaterial( {map: this.torch_texture, alphaTest: 0.5} ); 
   // this.torch_geometry = new THREE.Sprite( this.torch_material ); 
    
    this.tree_material = new THREE.SpriteMaterial( {map: this.tree_texture, alphaTest: 0.5} ); 
   // this.tree_geometry = new THREE.Sprite( this.tree_material ); 
    
    // THIS IS THE CLOCK CONTROLLER FOR ANIMATION
    this.clock = new THREE.Clock();
    this.current_frame = 9;
    this.i_walk = false;
    this.elapsedDelta = 0;

    //Utility
    this.width = _width;
    this.height = _height;
    // ---------------------------------------
    // - THIS IS THE KEYBOARD DETECTION VARS -
    // ---------------------------------------
    this.w_key = false;
    this.a_key = false;
    this.s_key = false;
    this.d_key = false;
    // -------------------------------------
    // - THIS RENDERS THE MAIN PLAYER SELF -
    // -------------------------------------
    this.player_x = 0; // My player X
    this.player_y = 0.25; // My player Y
    this.player_z = 0; // My player z
    this.player_dir = 1;// Looking At
    this.dir = 0;
	this.player_mdl = findGetParameter("mymdl");
	this.player_mat = findGetParameter("mymtl");
	this.player_name= findGetParameter("WOLFname");
    // -------------------------------------------
    // - THIS RENDERS THE ACTUAL PLAYER (CLIENT) -
    // -------------------------------------------
    //this.player_geometry = new THREE.PlaneGeometry( 1.7, 1.7 );
    this.player_material = new THREE.SpriteMaterial( { map: this.spr_animated_char, color: 0xffffff } );
    this.player_material.magFilter = THREE.NearestFilter;   // sharp pixel sprite
    this.spr_animated_char.repeat.set( 1/12, 1/1 );
    //this.player_client = new THREE.Mesh( this.player_geometry, this.player_material );
    this.player_client = new THREE.Sprite( this.player_material );
    this.player_client.scale.set(0, -1, 1);
    //this.scene.add( this.player_client );
    this.spr_animated_char.offset.x = 0.083333 * 11; // from 1 to 9
    //this.player_client.rotation.x = -1.5708;
    //this.player_client.position.y = 1.1;
    // --------------------------------------------
    var skene = this.scene;
    this.wloader = new OBJLoader();
    // ---------------------------------------------------------------------------
    const texture_ = new THREE.TextureLoader().load( "/resources/p_texture.png" );
	texture_.colorSpace = THREE.SRGBColorSpace;
    var avaskin = texture_;
    // var wavaskin = texture_;
    var bunny_mdl;
    //var in_world;
	var self_mdl = `http://modmasters.lets.game:1989/proxy?url=${encodeURIComponent(findGetParameter("mymdl"))}`;
	var self_mat = `http://modmasters.lets.game:1989/proxy?url=${encodeURIComponent(findGetParameter("mymtl"))}`;
    // ---------------------------------------------------------------------------
    this.loader = new OBJLoader();

	console.log(self_mdl);
	console.log(self_mat);

    this.loader.load(
        // resource URL
        self_mdl,
        // called when resource is loaded
        function ( object ) {
            object.scale.set(0.15,0.15,0.15);
           // object.setMaterials( avaskin );
            object.traverse( function( child ) {
                if ( child instanceof THREE.Mesh ) {
                  // //console.log(child.material);// = avaskin;
                    avaskin = new THREE.TextureLoader().load( self_mat , function (onload) {
					console.log("Texture 1 loaded...");
					child.material = new THREE.MeshLambertMaterial({
    					map: onload,
					});
					child.material.needsUpdate = true;
				}, undefined, function (error) {console.log("could not load texture :( 1");});
                   //console.log ("has mat");
                }
            } );
            //console.log(object);
            object.name = "bunbun";
            bunny_mdl = object;
            skene.add( bunny_mdl );
    
        },
        // called when loading is in progresses
        function ( xhr ) {
    
            console.log( ( xhr.loaded / xhr.total * 100 ) + '% loaded' );
    
        },
        // called when loading has errors
        function ( error ) {
    		 console.error('An error occurred while loading the OBJ file:', error);
            //console.log( 'An error happened' );
    
        }
    );

    this.object_;
    //console.log("bunbun");
    ////console.log(this.object_);
    // ---------------------------------------------------------------------------
    //this.camera = new THREE.OrthographicCamera( this.width / - 230, this.width / 230, this.height / 230, this.height / - 230, 1, 20 );
    this.camera = new THREE.PerspectiveCamera(50, this.width / this.height, 0.1, 200); // main camera
    this.camera.position.y = 8;
    this.camera.lookAt(new THREE.Vector3(0,0,0));
    //THREE WebGL renderer
    this.renderer = new THREE.WebGLRenderer({ // rendering options
      antialiasing: false
    });


    // -------------------------------------------
    this.rollOverGeo = new THREE.BoxGeometry( 0.5, 0.5, 0.5 );
	this.rollOverMaterial = new THREE.MeshBasicMaterial( { color: 0xff0000, opacity: 0.5, transparent: true } );
	this.rollOverMesh = new THREE.Mesh( this.rollOverGeo, this.rollOverMaterial );
	this.scene.add( this.rollOverMesh );
    
    // -------------------------------------------
    // - TEXTURE SPECIAL PROPERTIES WILL GO HERE - (I promise this will be the only horribly hardcoded part)
    // -------------------------------------------
    this.background_texture.wrapS = THREE.RepeatWrapping;
    this.background_texture.wrapT = THREE.RepeatWrapping;
    this.background_texture.repeat.set( 16, 16 );

   // this.debug = new OBJLoader2();

    this.spr_other_a_char.magFilter = THREE.NearestFilter;   // sharp pixel sprite
    this.spr_other_a_char.repeat.set( 1/12, 1/1 );
    this.spr_other_a_char.offset.x = 0.083333 * 11; // from 1 to 9

    this.ground_texture.wrapS = THREE.RepeatWrapping;
    this.ground_texture.wrapT = THREE.RepeatWrapping;
    this.ground_texture.repeat.set( 96, 96 );
    // ----------------------------------------------------------------
    this.commonvec1 = new THREE.Vector3(0,0,0);
    this.commonvec2 = new THREE.Vector3(0,0,0);
    this.commonvec3 = new THREE.Vector3(0,0,0);
    // --------------------------------------------------------------------------
    this.scene.background =  this.background_texture; // background color
    // --------------------------------------------------------------------------
    this.renderer.setSize(this.width, this.height);
    // ---------------------------------------------------------------------------
    // - BASIC SCENE CONSTRUCTION FOR GENERIC USE GOES HERE -
    // ------------------------------------------------------
    
    this.light = new THREE.AmbientLight( 0xDDDDDD ); // soft white light
    this.scene.add( this.light );

    //this.world_grnd_geo = new THREE.BoxGeometry( 150 , 150 );
    //this.world_grnd_mat = new THREE.MeshPhongMaterial( { map: this.ground_texture } );
    //this.world_grnd_msh = new THREE.Mesh( this.world_grnd_geo, this.world_grnd_mat );
    //this.scene.add( this.world_grnd_msh );
    //this.box_objects.push(this.world_grnd_msh);
    //this.world_grnd_msh.rotation.x = -1.5708;
    //this.world_grnd_msh.position.y = -0.8;
    
    //this.gridHelper = new THREE.GridHelper( 150, 300 );
    //this.gridHelper.position.y = -0.25;
	//this.scene.add( this.gridHelper );
    
    //Push the canvas to the DOM
    domElement.append(this.renderer.domElement);

    //Setup event listeners for events and handle the states
    window.addEventListener('resize', e => this.onWindowResize(e), false);
    domElement.addEventListener('mouseenter', e => this.onEnterCanvas(e), false);
    domElement.addEventListener('mouseleave', e => this.onLeaveCanvas(e), false);
    document.addEventListener( 'pointermove', e => this.onPointerMove(e) );
	document.addEventListener( 'pointerdown', e => this.onPointerDown(e) );
    window.addEventListener('keydown', e => this.onKeyDown(e), false);
    window.addEventListener('keyup', e => this.onKeyUp(e), false);

    this.update();

  }

  drawUsers(positions, id){
    for(let i = 0; i < Object.keys(positions).length; i++){
      if(Object.keys(positions)[i] != id){
        this.users[i].position.set(positions[Object.keys(positions)[i]].position[0],
                                   positions[Object.keys(positions)[i]].position[1],
                                   positions[Object.keys(positions)[i]].position[2]);
      }
    }
  }

  world_map_build() {
    if(can_int){
        let tmp; let tmp2; let has2 = false, skini;
        ////console.log(world_map);
        //console.log(d_world_map.length);
        for(let i = 0; i < d_world_map.length; i+=4){
            ////console.log(world_map[i]);
            switch(d_world_map[i]){
                    case 1:
                        tmp = new THREE.Sprite( this.torch_material ); 
                        //tmp.rotation.x = -1.5708;
                        tmp.position.x = d_world_map[i + 1];
                        tmp.position.z = d_world_map[i + 3];
                        tmp.position.y = d_world_map[i + 2] + (tmp.position.z / 1000);// - 0.1;
                        tmp2 = new THREE.PointLight(0xffffff, 0.3);
                        tmp2.position.x = d_world_map[i + 1];
                        tmp2.position.y = d_world_map[i + 2]+1;
                        tmp2.position.z = d_world_map[i + 3]-0.5;
                        //tmp.scale.set(0, 1, 1);
                        has2 = true;
                    break;

                    case 2:
                        tmp = new THREE.Sprite( this.tree_material ); 
                        tmp.scale.set(4, 4, 4);
                        //tmp.rotation.x = -1.5708;
                        tmp.position.x = d_world_map[i + 1];
                        tmp.position.z = d_world_map[i + 3];
                        tmp.position.y = d_world_map[i + 2] + 1.8;// - 0.1;
                        
                        has2 = false;
                    break;
            }   

            if(has2){this.scene.add(tmp2);has2=false;}
            this.scene.add( tmp );
            skini = this.scene;
        }

        for(let i = 0; i < wrl_interactives.length; i+=7){
          console.log("CREATE INTERACTIVES");
          const wrl_mdl2 = `http://modmasters.lets.game:1989/proxy?url=${encodeURIComponent(wrl_interactives[i+1])}`;
	      const wrl_mat2 = `http://modmasters.lets.game:1989/proxy?url=${encodeURIComponent(wrl_interactives[i+2])}`;

          this.wloader.load(
                // resource URL
                wrl_mdl2,
                // called when resource is loaded
                function ( object ) {
                    object.scale.set(0.15,0.15,0.15);
                   // object.setMaterials( avaskin );
                    object.traverse( function( child ) {
                        if ( child instanceof THREE.Mesh ) {
                          // //console.log(child.material);// = avaskin;
                            var wavaskin = new THREE.TextureLoader().load( wrl_mat2 , function (onload) {
                            console.log("Texture 1 loaded...");
                            child.material = new THREE.MeshLambertMaterial({
                                map: onload,
                            });
                            child.material.needsUpdate = true;

                            child.geometry.computeBoundingBox();
                            child.geometry.computeBoundingSphere();
                            interactive_obj.push(child);
                            console.log(child.parent.name);
                        }, undefined, function (error) {console.log("could not load texture :( 1");});
                           //console.log ("has mat");
                        }
                    } );
                    //console.log(object);
                    object.name = wrl_interactives[i];
                    var in_world2 = object;
                    in_world2.position.x = wrl_interactives[i+3];
                    in_world2.position.y = wrl_interactives[i+4];
                    in_world2.position.z = wrl_interactives[i+5];
                    in_world2.rotation.y = wrl_interactives[i+6];

                    //interactive_obj.push(in_world2);
                    skini.add( in_world2 );
            
                },
                // called when loading is in progresses
                function ( xhr ) {
            
                    console.log( ( xhr.loaded / xhr.total * 100 ) + '% loaded' );
            
                },
                // called when loading has errors
                function ( error ) {
                     console.error('An error occurred while loading the OBJ file:', error);
                    //console.log( 'An error happened' );
            
                }
          );
        }

        var wrl_mdl = `http://modmasters.lets.game:1989/proxy?url=${encodeURIComponent(_3d_world_model_)}`;
	    var wrl_mat = `http://modmasters.lets.game:1989/proxy?url=${encodeURIComponent(_world_material_)}`;
        
        if(has_a_world_map_ == 1){
            this.wloader.load(
                // resource URL
                wrl_mdl,
                // called when resource is loaded
                function ( object ) {
                    object.scale.set(0.15,0.15,0.15);
                   // object.setMaterials( avaskin );
                    object.traverse( function( child ) {
                        if ( child instanceof THREE.Mesh ) {
                          // //console.log(child.material);// = avaskin;
                            var wavaskin = new THREE.TextureLoader().load( wrl_mat , function (onload) {
                            console.log("Texture 1 loaded...");
                            child.material = new THREE.MeshLambertMaterial({
                                map: onload,
                            });
                            child.material.needsUpdate = true;
                        }, undefined, function (error) {console.log("could not load texture :( 1");});
                           //console.log ("has mat");
                        }
                    } );
                    //console.log(object);
                    object.name = "3dworld";
                    var in_world = object;
                    skini.add( in_world );
            
                },
                // called when loading is in progresses
                function ( xhr ) {
            
                    console.log( ( xhr.loaded / xhr.total * 100 ) + '% loaded' );
            
                },
                // called when loading has errors
                function ( error ) {
                     console.error('An error occurred while loading the OBJ file:', error);
                    //console.log( 'An error happened' );
            
                }
            );
        }
        if (world_fog_color_[0] < 0 || world_fog_color_[0] > 255 || 
            world_fog_color_[1] < 0 || world_fog_color_[1] > 255 || 
            world_fog_color_[2] < 0 || world_fog_color_[2] > 255) {
            console.log("Los valores RGB deben estar entre 0 y 255.");
            world_has_fog_en = 0;
            //return;
        }
    
        // Convertir valores RGB (0-255) a formato hexadecimal
        if(world_has_fog_en == 1){
            const colorHex = (world_fog_color_[0] << 16) | (world_fog_color_[1] << 8) | world_fog_color_[2];
            skini.fog = new THREE.Fog( colorHex, 1, 25 );
            skini.background = new THREE.Color(colorHex);
        }

        can_int = false;


        var floor_tex = `http://modmasters.lets.game:1989/proxy?url=${encodeURIComponent( _3d_floor_text_ )}`;

        var wavaskin = new THREE.TextureLoader().load( floor_tex , function (onload) {
            console.log("Texture 1 loaded...");
            onload.wrapS = THREE.RepeatWrapping;
            onload.wrapT = THREE.RepeatWrapping;
            onload.repeat.set( _3d_floor_size_/10, _3d_floor_size_/10 );
            var world_grnd_geo = new THREE.BoxGeometry( _3d_floor_size_ ,0 , _3d_floor_size_ );
            var world_grnd_msh = new THREE.Mesh( world_grnd_geo, new THREE.MeshLambertMaterial({ map: onload, }) );
            skini.add( world_grnd_msh);
        });

        this.player_x = spawn_point[0];
        this.player_y = spawn_point[1];
        this.player_z = spawn_point[2];
    }
  }

  user_movs () {
    if(this.w_key && !this.s_key){
        this.player_x = this.player_client.position.x + Math.cos((this.dir * 3.14159) / 180) * -0.05;
        this.player_z = this.player_client.position.z - Math.sin((this.dir * 3.14159) / 180) * -0.05;
        this.player_dir = 180;
    }
    if(this.a_key && !this.d_key){this.dir += 2;}
    if(this.s_key && !this.w_key){
        this.player_x = this.player_client.position.x + Math.cos((this.dir * 3.14159) / 180) * 0.05;//0.15;
        this.player_z = this.player_client.position.z - Math.sin((this.dir * 3.14159) / 180) * 0.05;//0.15;
        this.player_dir = 0;
    }
    if(this.d_key  && !this.a_key){this.dir -= 2;}

    if(this.w_key || this.a_key || this.s_key || this.d_key ){
        this.i_walk = true;
    }else{
        this.i_walk = false;
    }
    //if(this.w_key){this.player_z-=0.06;}
    //if(this.a_key){this.player_x-=0.06;this.player_dir = -1;}
    //if(this.s_key && !this.w_key){this.player_z+=0.06;}
    //if(this.d_key && !this.a_key){this.player_x+=0.06;this.player_dir = 1;}

    //if(this.w_key || this.a_key || this.s_key || this.d_key ){
    //    this.i_walk = true;
    //}else{
    //    this.i_walk = false;
    //}
    
    //this.player_y = this.player_z / 1000;
  }

  animation_update (delta){
    this.elapsedDelta += delta * 6;
    ////console.log(this.elapsedDelta);
    if(this.elapsedDelta > 0.5){
        this.elapsedDelta = 0;
        this.current_frame += 1;
        if(this.current_frame > 10){
            this.current_frame = 0;
        }
    }
    //
    this.spr_other_a_char.offset.x = 0.083333 * this.current_frame;
    if(this.i_walk){
        this.spr_animated_char.offset.x = 0.083333 * this.current_frame; // from 1 to 9
    }else{
        this.spr_animated_char.offset.x = 0.083333 * 11; // from 1 to 9
    }
  }

  cam_calculate(){
    this.camera.position.y = this.player_client.position.y + 0.8;
    this.camera.position.x = this.player_client.position.x + Math.cos((this.dir * 3.14159) / 180) * 2.0;
    this.camera.position.z = this.player_client.position.z - Math.sin((this.dir * 3.14159) / 180) * 2.0;
  }
  

  
  update(){
    this.world_map_build();
    requestAnimationFrame(() => this.update());

    this.object_ = this.scene.getObjectByName( "bunbun", true );
    ////console.log(this.object_);
    if(this.object_ != null){
    this.object_.position.x = this.player_x;
    this.object_.position.y = this.player_y-0.5;
    this.object_.position.z = this.player_z;
    this.object_.rotation.y = ((this.dir + this.player_dir) * 3.14159) / 180;
    }
    //this.object_.rotation.rotateZ((this.dir * 3.14159) / 180);
    this.player_client.position.x = this.player_x;
    this.player_client.position.y = this.player_y;
    this.player_client.position.z = this.player_z;
    this.player_client.scale.x = this.player_dir;
    //this.camera.position.x = this.player_x;
    //this.camera.position.z = this.player_z;
    this.commonvec2.set(this.player_client.position.x,this.player_client.position.y+0.7,this.player_client.position.z);
    this.cam_calculate();
    this.camera.lookAt(this.commonvec2); 
    //this.controls.update(this.clock.getDelta());
    //this.controls.target = new THREE.Vector3(0,0,0);
    ////console.log( this.clock.getDelta() );
    this.animation_update( this.clock.getDelta() );
    this.user_movs();
    this.render();
    this.emit('userMoved');
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  onWindowResize(e) {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();

    this.renderer.setSize( window.innerWidth, window.innerHeight );

    //controls.handleResize();
  }

  onLeaveCanvas(e){
    //this.controls.enabled = false;
  }
  onEnterCanvas(e){
    //this.controls.enabled = true;
  }
  onKeyDown(e){
    this.emit('userMoved');
    ////console.log(e);
    switch (e.key){
      case 'w':this.w_key = true;break;
      case 'a':this.a_key = true;break;
      case 's':this.s_key = true;break;
      case 'd':this.d_key = true;break;
    }
  }

  onKeyUp(e){
   switch (e.key){
     case 'w':this.w_key = false;break;
     case 'a':this.a_key = false;break;
     case 's':this.s_key = false;break;
     case 'd':this.d_key = false;break;
   }
   // //console.log("prian");
  }

  onPointerMove( event ) {
    //console.log(event)
    this.pointer.set( ( event.clientX / window.innerWidth ) * 2 - 1, - ( event.clientY / window.innerHeight ) * 2 + 1 );

    this.raycaster.setFromCamera( this.pointer, this.camera );
    this.raycaster.linePrecision = 10
    //console.log("Raycast:");
    //console.log(this.pointer);
    //console.log(this.raycaster);
    //this.rollOverMesh.position.set( this.pointer.position, 2 );
    const intersects = this.raycaster.intersectObjects( this.box_objects, false );

    if ( intersects.length > 0 ) {

        const intersect = intersects[ 0 ];
        //console.log(intersect.point);
        this.rollOverMesh.position.copy( intersect.point );//.add( intersect.face.normal );
        this.rollOverMesh.position.divideScalar( 0.5 ).floor().multiplyScalar( 0.5 ).addScalar( 0.25 );
        //this.rollOverMesh.position.set(intersect.face.normal);
        //console.log("intercept:");
        //console.log(intersect.point);
        //render();

    }
 }

 onPointerDown (event) {
    this.pointer.set( ( event.clientX / window.innerWidth ) * 2 - 1, - ( event.clientY / window.innerHeight ) * 2 + 1 );

    this.raycaster.setFromCamera( this.pointer, this.camera );


	const intersects = this.raycaster.intersectObjects( this.box_objects , false );
	const intersects2 = this.raycaster.intersectObjects( interactive_obj , false );
    console.log(intersects);
    //const intersects2 = this.raycaster.intersectObjects( interactive_obj , false );
    
    console.log(this.raycaster);
	if ( intersects.length > 0 ) {

					const intersect = intersects[ 0 ];

					// delete cube

					
                        console.log("placed");
						const voxel = new THREE.Mesh( this.rollOverGeo, this.world_grnd_mat );
						
                        voxel.position.copy( intersect.point );//.add( intersect.face.normal );
						voxel.position.divideScalar( 0.5 ).floor().multiplyScalar( 0.5 ).addScalar( 0.25 );
						this.scene.add( voxel );

						this.box_objects.push( voxel );

					//}

					//render();

	}

    if ( intersects2.length > 0 ) {

        const intersect2 = intersects2[ 0 ];
        console.log( intersect2.object.parent.name );
        if(intersect2.object.parent.name != "disabled"){
            open(intersect2.object.parent.name);
        }
    }
    //console.log("clicked");
 }
}

export default Scene;
