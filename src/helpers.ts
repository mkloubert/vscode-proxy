// The MIT License (MIT)
// 
// vscode-proxy (https://github.com/mkloubert/vscode-proxy)
// Copyright (c) Marcel Joachim Kloubert <marcel.kloubert@gmx.net>
// 
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to
// deal in the Software without restriction, including without limitation the
// rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
// sell copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
// 
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
// 
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
// FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
// DEALINGS IN THE SOFTWARE.


/**
 * Checks if a value is (null).
 * 
 * @param {any} val The value to check.
 * 
 * @return {boolean} Is (null) or not.
 */
export function isNull(val: any): val is null {
    return null === val;
}

/**
 * Checks if a value is (null) or (undefined).
 * 
 * @param {any} val The value to check.
 * 
 * @return {boolean} Is (null)/(undefined) or not.
 */
export function isNullOrUndefined(val: any): val is (null | undefined) {
    return isNull(val) ||
           isUndefined(val);
}

/**
 * Checks if a value is (undefined).
 * 
 * @param {any} val The value to check.
 * 
 * @return {boolean} Is (undefined) or not.
 */
export function isUndefined(val: any): val is undefined {
    return 'undefined' === typeof val;
}

/**
 * Converts a value to a string that is NOT (null) or (undefined).
 * 
 * @param {any} str The input value.
 * @param {any} defValue The default value.
 * 
 * @return {string} The output value.
 */
export function toStringSafe(str: any, defValue: any = ''): string {
    try {
        if ('string' === typeof str) {
            return str;
        }

        if (isNullOrUndefined(str)) {
            return defValue;
        }
        
        if (Buffer.isBuffer(str)) {
            return str.toString('utf8');
        }

        if ('object' === typeof str ||
            Array.isArray(str)) {

            if ('function' === typeof str.toString) {
                return '' + str.toString();
            }

            return JSON.stringify(str);
        }
    }
    catch (e) {
        console.error(e, 'helpers.toStringSafe(1)');
    }

    try {
        return '' + str;
    }
    catch (e) {
        console.error(e, 'helpers.toStringSafe(2)');
    }

    return '';
}
