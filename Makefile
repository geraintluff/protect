all: balloon.min.js matsui-bundle.min.js

%.min.js: %.js
	@cd "$$(dirname $@)" && npx uglify-js@3.17.4 "$$(basename $<)" -o "$$(basename $@)" --source-map "url=$$(basename $@).map" \
		--warn --compress passes=10 --mangle --output-opts ascii_only --mangle-props "regex=/^(m_|#)/"