"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLogger = getLogger;
var typescript_logging_category_style_1 = require("typescript-logging-category-style");
var provider = typescript_logging_category_style_1.CategoryProvider.createProvider("Pomp");
function getLogger(name) {
    return provider.getCategory(name);
}
