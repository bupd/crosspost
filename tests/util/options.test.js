/**
 * @fileoverview Tests for options utilities
 * @author Nicholas C. Zakas
 */

//-----------------------------------------------------------------------------
// Imports
//-----------------------------------------------------------------------------

import assert from "node:assert";
import { getPostMedia, validatePostOptions } from "../../src/util/options.js";

//-----------------------------------------------------------------------------
// Tests
//-----------------------------------------------------------------------------

describe("validatePostOptions()", () => {
	it("should not throw error when options is undefined", () => {
		assert.doesNotThrow(() => validatePostOptions());
	});

	it("should not throw error when options is empty object", () => {
		assert.doesNotThrow(() => validatePostOptions({}));
	});
	it("should throw error when images is not an array", () => {
		assert.throws(
			() => validatePostOptions({ images: {} }),
			new TypeError("images must be an array."),
		);
	});

	it("should throw error when image has no data", () => {
		assert.throws(
			() => validatePostOptions({ images: [{}] }),
			new TypeError("Image must have data."),
		);
	});

	it("should throw error when image data is not Uint8Array", () => {
		assert.throws(
			() => validatePostOptions({ images: [{ data: "hello" }] }),
			new TypeError("Image data must be a Uint8Array."),
		);
	});

	it("should not throw error when options are valid", () => {
		const options = {
			images: [{ data: new Uint8Array() }],
		};
		assert.doesNotThrow(() => validatePostOptions(options));
	});

	it("should throw error when media is not an array", () => {
		assert.throws(
			() => validatePostOptions({ media: {} }),
			new TypeError("media must be an array."),
		);
	});

	it("should throw error when media has invalid type", () => {
		assert.throws(
			() =>
				validatePostOptions({
					media: [
						{
							data: new Uint8Array(),
							type: "audio",
							mimeType: "audio/mpeg",
						},
					],
				}),
			new TypeError('Media type must be "image" or "video".'),
		);
	});

	it("should not throw error when media is valid", () => {
		const options = {
			media: [
				{
					data: new Uint8Array(),
					type: "video",
					mimeType: "video/mp4",
				},
			],
		};
		assert.doesNotThrow(() => validatePostOptions(options));
	});
});

describe("getPostMedia()", () => {
	it("should return media when present", () => {
		const media = [
			{
				data: new Uint8Array(),
				type: "video",
				mimeType: "video/mp4",
			},
		];

		assert.strictEqual(getPostMedia({ media }), media);
	});

	it("should normalize images when media is not present", () => {
		const data = new Uint8Array();
		assert.deepStrictEqual(
			getPostMedia({ images: [{ data, alt: "alt" }] }),
			[
				{
					data,
					alt: "alt",
					type: "image",
					mimeType: "",
				},
			],
		);
	});

	it("should return an empty array when no media is present", () => {
		assert.deepStrictEqual(getPostMedia({}), []);
	});
});
