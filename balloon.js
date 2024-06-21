let cryptoUtils = (function factory() {
	let api = {factory: factory};

	let primes = [];
	for (let n = 2; primes.length < 64; ++n) {
		if (!primes.some(p => !(n%p))) {
			primes.push(n);
		}
	}
	let maxWord = 4294967296;
	// Initial hash value: first 32 bits of the fractional parts of the square roots of the first 8 primes
	let initialHash = primes.slice(0, 8).map(p => (Math.sqrt(p)*maxWord)|0);
	// Round constants: first 32 bits of the fractional parts of the cube roots of the first 64 primes
	let roundConstants = primes.map(p => (Math.cbrt(p)*maxWord)|0);

	// allocate fixed-sized things up-front
	let chunk = new Int32Array(64);
	
	// cached between calls
	let cachedWords = new Int32Array(32);

	let sha256 = api.sha256 = function sha256(uint8array, output8) {
		if (typeof uint8array === 'string') { // UTF-8 encoding
			let encoder = new TextEncoder();
			uint8array = encoder.encode(uint8array);
		}
		let outputHex = output8 == 'hex';
		if (outputHex) output8 = null;
		output8 = output8 || new Uint8Array(32);

		let byteLength = uint8array.length;
		let wordsLength = Math.ceil((byteLength + 1/*padding*/ + 8/*length*/)/64)*16;
		let words = (wordsLength == 32) ? cachedWords.fill(0) : new Int32Array(wordsLength);
		// Copy input in
		var bytes = new Uint8Array(words.buffer);
		bytes.set(uint8array);
		bytes[byteLength] = 0x80; // pad with 10000...

		// Re-interpret as big-endian
		let dataView = new DataView(words.buffer);
		for (let i = 0; i < wordsLength; ++i) {
			words[i] = dataView.getInt32(i*4);
		}
		// write bit length, as big-endian 64-bit integer
		words[wordsLength - 1] = (byteLength*8)|0;
		words[wordsLength - 2] = (byteLength*8/maxWord)|0;

		var hash = new Int32Array(output8.buffer);
		for (let i = 0; i < 8; ++i) hash[i] = initialHash[i];
		// the "working hash", often labelled as variables a...g
		let roundHash = hash.slice(0, 8);
		
		// process each chunk
		for (let chunkStart = 0; chunkStart < wordsLength; chunkStart += 16) {
			for (let i = 0; i < 16; ++i) {
				chunk[i] = words[chunkStart + i];
			}
			// Expand the chunk into 64 words
			for (let i = 16; i < 64; ++i) {
				var w15 = chunk[i - 15], w2 = chunk[i - 2];
				chunk[i] = (
					chunk[i - 16] + chunk[i - 7]
					// (x>>>R)|(x<<(32-R)) is right-rotation by R bits
					+ (((w15>>>7)|(w15<<25)) ^ ((w15>>>18)|(w15<<14)) ^ (w15>>>3)) // s0
					+ (((w2>>>17)|(w2<<15)) ^ ((w2>>>19)|(w2<<13)) ^ (w2>>>10)) // s1
				)|0;
			}
			
			for (let i = 0; i < 64; i++) {
				// Iterate
				var a = roundHash[0], e = roundHash[4];
				var temp1 = (
					roundHash[7]
					+ (((e>>>6)|(e<<26)) ^ ((e>>>11)|(e<<21)) ^ ((e>>>25)|(e<<7))) // S1
					+ ((e&roundHash[5])^((~e)&roundHash[6])) // ch
					+ roundConstants[i] + chunk[i]
				);
				var temp2 = (
					(a&roundHash[1])^(a&roundHash[2])^(roundHash[1]&roundHash[2])) // maj
					+ (((a>>>2)|(a<<30)) ^ ((a>>>13)|(a<<19)) ^ ((a>>>22)|(a<<10))
				); // S0

				roundHash[7] = roundHash[6];
				roundHash[6] = roundHash[5];
				roundHash[5] = e;
				roundHash[4] = (roundHash[3] + temp1)|0;
				roundHash[3] = roundHash[2];
				roundHash[2] = roundHash[1];
				roundHash[1] = a;
				roundHash[0] = (temp1 + temp2)|0;
			}
			
			for (let i = 0; i < 8; i++) {
				hash[i] = roundHash[i] = (hash[i] + roundHash[i])|0;
			}
		}
		
		// Re-write as big-endian
		let outputView = new DataView(output8.buffer);
		for (let i = 0; i < 8; i++) {
			outputView.setInt32(i*4, hash[i]);
		}
		if (outputHex) {
			return Array.from(output8, byte => (byte>>>4).toString(16) + (byte&0xF).toString(16)).join("");
		}
		return output8;
	};

	/*
	if (self.crypto?.subtle) {
		let testBuffer = new Uint8Array(32 + Math.random()*1000);
		self.crypto.getRandomValues(testBuffer);
		self.crypto.subtle.digest("SHA-256", testBuffer).then(digest => {
			let expected = new Uint8Array(digest);
			let actual = sha256(testBuffer);
			for (let i = 0; i < 32; ++i) {
				if (expected[i] != actual[i]) {
					alert("failed sha256() test");
					throw Error("sha256() failed for data: " + Array.from(testBuffer));
				}
			}
		});
	}
	*/
	
	// https://eprint.iacr.org/2016/027.pdf with sha256
	let balloon = api.balloon = async function(salt, key, options={}) {
		let encoder = new TextEncoder();
		if (typeof salt === 'string') salt = sha256(encoder.encode(salt));
		if (typeof key === 'string') text = sha256(encoder.encode(key));

		let bufferCount = options.buffers || 8192;
		let rounds = options.rounds || 4;
		let delta = options.delta || 3;
		let buffers = [];
		
		let workPeriod = options.workPeriod || 100, workRatio = options.workRatio || 1;
		let restPeriod = workPeriod*(1/workRatio - 1);
		let progress = options.progress || (x => x);

		if (salt.length != 32) salt = sha256(salt);
		if (key.length != 32) key = sha256(key);

		let hashInput = new Uint8Array(68);
		let hashInputView = new DataView(hashInput.buffer);
		let finalCounter = bufferCount*(1 + rounds*(1 + 2*delta));
		let counter = 0;
		function hash(blockA, blockB) {
			hashInputView.setUint32(0, counter++, true);
			for (let i = 0; i < 32; ++i) hashInput[4 + i] = blockA[i];
			for (let i = 0; i < 32; ++i) hashInput[36 + i] = blockB[i];
			return sha256(hashInput);
		}
		
		// Expand input
		buffers[0] = hash(key, salt);
		for (let b = 1; b < bufferCount; ++b) {
			buffers[b] = hash(buffers[b - 1], salt);
		}

		let nextWorkEnd = Date.now() + workPeriod;

		// Mixing
		let indexBlock = new Uint8Array(32);
		let indexView = new DataView(indexBlock.buffer);
		for (let t = 0; t < rounds; ++t) {
			for (let b = 0; b < bufferCount; ++b) {
				if (Date.now() > nextWorkEnd) {
					progress(counter, finalCounter);
					t = await (new Promise((pass, fail) => {
						setTimeout(_ => pass(t), restPeriod);
					}));
					nextWorkEnd = Date.now() + workPeriod;
				}

				let prev = (b == 0) ? buffers[bufferCount - 1] : buffers[b - 1];
				buffers[b] = hash(prev, buffers[b]);
				
				for (let d = 0; d < delta; ++d) {
					// [t, b, d] as 32-bit little-endian ints
					indexView.setUint32(0, t, true);
					indexView.setUint32(4, b, true);
					indexView.setUint32(8, d, true);
					let hashedIndex = hash(salt, indexBlock);
					let hashedView = new DataView(hashedIndex.buffer);
					let otherIndex = hashedView.getUint32(0, true);
					
					buffers[b] = hash(buffers[b], buffers[otherIndex%bufferCount]);
				}
			}
		}
		
		progress(counter, finalCounter);
		return buffers[bufferCount - 1];
	}
	
	api.aesPair = async function(rawKey) {
		if (typeof rawKey === 'string') rawKey = Uint8Array.fromBase64(rawKey);

		return crypto.subtle.importKey("raw", rawKey, "AES-GCM", /*exportable*/false, ["encrypt", "decrypt"])
			.then(aesKey => ({
				key: aesKey,
				encrypt: (plainText, toBase64) => {
					if (typeof plainText === 'string') plainText = new TextEncoder().encode(plainText);

					let iv = new Uint8Array(12); // AES IV is 96 bits
					self.crypto.getRandomValues(iv);

					return crypto.subtle.encrypt({
						name: 'AES-GCM',
						iv: iv,
						tagLength: 128
					}, aesKey, plainText).then(encrypted => {
						encrypted = new Uint8Array(encrypted);
						let combined = new Uint8Array(12 + encrypted.length);
						combined.set(iv);
						combined.set(encrypted, 12);

						return toBase64 ? combined.toBase64(true) : combined;
					});
				},
				decrypt: (combined, decodeUtf8) => {
					if (typeof combined === 'string') combined = Uint8Array.fromBase64(combined);
					let iv = combined.subarray(0, 12);
					let encrypted = combined.subarray(12);
					return crypto.subtle.decrypt({
						name: 'AES-GCM',
						iv: iv,
						tagLength: 128
					}, aesKey, encrypted).then(plainText => {
						if (decodeUtf8) return new TextDecoder('utf-8', {fatal: true}).decode(plainText);
						return plainText;
					})
				}
			}));
	}
	
	// Uses the Balloon Hash to create an AES-256 key, and encode/decode with AES-GCM prepended with 96-bit IV
	api.balloonPair = async function(salt, key, options={}) {
		return api.balloon(salt, key, options).then(api.aesPair);
	};

	Uint8Array.prototype.toBase64 = function(webSafe) {
		let result = btoa(Array.from(this, x => String.fromCharCode(x)).join(""));
		if (webSafe) result = result.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+/, '');
		return result;
	};
	Uint8Array.fromBase64 = base64 => Uint8Array.from(atob(base64.replace(/_/g, '/').replace(/-/g, '+')), x => x.charCodeAt(0));
	Uint8Array.prototype.toHex = function() {
		return Array.from(this, byte => (byte>>>4).toString(16) + (byte&0xF).toString(16)).join("");
	};
	Uint8Array.fromHex = hex => {
		let length = hex.length/2;
		let result = new Uint8Array(length);
		for (let i = 0; i < length; ++i) {
			result[i] = parseInt(hex.slice(2*i, 2*i + 2), 16) || 0;
		}
		return result;
	};
	
	return api;
})();
