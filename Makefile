all: balloon.min.js matsui-bundle.min.js protect.html

protect.html: index.html *.min.js
	node -e 'const fs=require("fs");fs.writeFileSync("protect.html",fs.readFileSync("index.html","utf8").replace(/<script src="([^"]*)">/g,(m,filename)=>"<script>"+fs.readFileSync(filename,"utf8")));'

%.min.js: %.js
	@cd "$$(dirname $@)" && npx uglify-js@3.17.4 "$$(basename $<)" -o "$$(basename $@)" --source-map "url=$$(basename $@).map" \
		--warn --compress passes=10 --mangle --output-opts ascii_only --mangle-props "regex=/^(m_|#)/"