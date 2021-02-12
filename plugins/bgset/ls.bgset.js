(function () {
	"use strict";
	if (!window.addEventListener) {
		return;
	}

	var regWhite = /\s+/g;
	var regSplitSet = /\s*\|\s+|\s+\|\s*/g;
	var regSource = /^(.+?)(?:\s+\[\s*(.+?)\s*\])?$/;
	var regBgUrlEscape = /\(|\)|'/;
	var allowedBackgroundSize = { contain: 1, cover: 1 };
	var proxyWidth = function (elem) {
		var width = lazySizes.gW(elem, elem.parentNode);

		if (!elem._lazysizesWidth || width) {
			elem._lazysizesWidth = width;
		}
		return elem._lazysizesWidth;
	};
	var getBgSize = function (elem) {
		var bgSize;

		bgSize = (
			getComputedStyle(elem) || { getPropertyValue: function () {} }
		).getPropertyValue("background-size");

		if (
			!allowedBackgroundSize[bgSize] &&
			allowedBackgroundSize[elem.style.backgroundSize]
		) {
			bgSize = elem.style.backgroundSize;
		}

		return bgSize;
	};
	var createPicture = function (sets, elem, img) {
		var picture = document.createElement("picture");
		var dpr = window.devicePixelRatio || 1;
		var sizes = elem.getAttribute(lazySizesConfig.sizesAttr) / dpr;
		var ratio = elem.getAttribute("data-ratio");
		var optimumx = elem.getAttribute("data-optimumx");

		if (elem._lazybgset && elem._lazybgset.parentNode == elem) {
			elem.removeChild(elem._lazybgset);
		}

		Object.defineProperty(img, "_lazybgset", {
			value: elem,
			writable: true,
		});
		Object.defineProperty(elem, "_lazybgset", {
			value: picture,
			writable: true,
		});

		sets = sets.replace(regWhite, " ").split(regSplitSet);

		picture.style.display = "none";
		img.className = lazySizesConfig.lazyClass;

		if (sets.length == 1 && !sizes) {
			sizes = "auto";
		}

		sets.forEach(function (set) {
			var source = document.createElement("source");

			if (sizes && sizes != "auto") {
				source.setAttribute("sizes", sizes);
			}

			if (set.match(regSource)) {
				source.setAttribute(lazySizesConfig.srcsetAttr, RegExp.$1);
				if (RegExp.$2) {
					source.setAttribute(
						"media",
						lazySizesConfig.customMedia[RegExp.$2] || RegExp.$2
					);
				}
			}
			picture.appendChild(source);
		});

		if (sizes) {
			img.setAttribute(lazySizesConfig.sizesAttr, sizes);
			elem.removeAttribute(lazySizesConfig.sizesAttr);
			elem.removeAttribute("sizes");
		}
		if (optimumx) {
			img.setAttribute("data-optimumx", optimumx);
		}
		if (ratio) {
			img.setAttribute("data-ratio", ratio);
		}

		picture.appendChild(img);

		elem.appendChild(picture);

		var width = proxyWidth(elem);
		preventCachingLargestSize(elem, width);
	};

	var proxyLoad = function (e) {
		if (!e.target._lazybgset) {
			return;
		}

		var image = e.target;
		var elem = image._lazybgset;
		var bg = image.currentSrc || image.src;

		if (bg) {
			elem.style.backgroundImage =
				"url(" +
				(regBgUrlEscape.test(bg) ? JSON.stringify(bg) : bg) +
				")";
		}

		if (image._lazybgsetLoading) {
			lazySizes.fire(elem, "_lazyloaded", {}, false, true);
			delete image._lazybgsetLoading;
		}
	};

	var preventCachingLargestSize = function (grid, width) {
		var picture = Array.prototype.filter.call(
			grid.children,
			function (child) {
				return child.tagName === "PICTURE";
			}
		)[0];

		var source = picture && picture.querySelector("source");
		var srcset = source && source.getAttribute("data-srcset");

		if (!srcset) {
			return;
		}

		var sets = srcset.split(", ").map(function (set) {
			var matches = set.match(/([^ ]+) (\d+)/) || [];
			return {
				url: matches[1],
				width: parseInt(matches[2], 10),
			};
		});

		var widthFound = sets.find(function (set) {
			return set.width === width;
		});

		if (widthFound) {
			sets = sets.filter(function (set) {
				return set.width <= width;
			});
		} else {
			sets = sets.reduce(
				function (acc, set) {
					if (set.width <= width) {
						acc.result.push(set);
					} else if (!acc.found) {
						acc.result.push(set);
						acc.found = true;
					}
					return acc;
				},
				{
					found: false,
					result: [],
				}
			).result;
		}

		var srcsetToPreventCache = sets
			.map(function (set) {
				return set.url + " " + set.width + "w";
			})
			.join(", ");
		source.setAttribute("srcset", srcsetToPreventCache);
	};

	addEventListener("lazybeforeunveil", function (e) {
		var set =
				typeof (e.target || {}).getAttribute === "function" &&
				e.target.getAttribute("data-bgset"),
			image,
			elem;

		if (
			!set &&
			e.target.classList &&
			e.target.classList.contains("lazyload-background")
		) {
			set = e.target.getAttribute("data-srcset");
			e.target.setAttribute("data-bgset", set);
			e.target.removeAttribute("data-srcset");
		}

		if (e.defaultPrevented || !set) {
			return;
		}

		elem = e.target;
		image = document.createElement("img");

		image.alt = "";

		image._lazybgsetLoading = true;
		e.detail.firesLoad = true;

		createPicture(set, elem, image);

		setTimeout(function () {
			lazySizes.loader.unveil(image);

			lazySizes.rAF(function () {
				lazySizes.fire(image, "_lazyloaded", {}, true, true);
				if (image.complete && image.naturalWidth > 1) {
					proxyLoad({ target: image });
				}
			});
		});
	});

	document.addEventListener("load", proxyLoad, true);

	window.addEventListener(
		"lazybeforesizes",
		function (e) {
			if (e.target._lazybgset && e.detail.dataAttr) {
				var elem = e.target._lazybgset;
				var bgSize = getBgSize(elem);

				if (allowedBackgroundSize[bgSize]) {
					e.target._lazysizesParentFit = bgSize;

					lazySizes.rAF(function () {
						e.target.setAttribute("data-parent-fit", bgSize);
						if (e.target._lazysizesParentFit) {
							delete e.target._lazysizesParentFit;
						}
					});
				}
			}
		},
		true
	);

	document.documentElement.addEventListener("lazybeforesizes", function (e) {
		var grid =
			e.target.closest("picture") &&
			e.target.closest(".lazyload-background");
		if (e.defaultPrevented || !grid) {
			return;
		}
		e.detail.width = e.detail.width || proxyWidth(grid);

		preventCachingLargestSize(grid, e.detail.width);
	});
})();
