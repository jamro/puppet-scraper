#!/bin/bash

../puppet-scraper.js --dataset ./data/products_1.json --script ./scripts/list.js --query '$[*]' --output ./data/products_2.json --pretty
../puppet-scraper.js --dataset ./data/products_2.json --script ./scripts/product.js --query '$[*].products[*]' --output ./data/products_3.json --pretty
../puppet-scraper.js --dataset ./data/products_3.json --script ./scripts/seller.js --query '$[*].products[*].seller' --output ./data/products_4.json --pretty