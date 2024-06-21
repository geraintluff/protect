all: balloon.min.js

%.min.js: %.js
	@cd "$$(dirname $@)" && npx --offline uglify-js "$$(basename $<)" -o "$$(basename $@)" --source-map "url=$$(basename $@).map" \
		--warn --compress passes=10 --mangle --output-opts ascii_only --mangle-props "regex=/^(m_|#)/"

publish:
	publish-signalsmith-raw /tmp/protect

