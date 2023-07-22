#! /usr/bin/env node

import puppeteer from 'puppeteer';
import { readFile, unlink, writeFile } from "fs/promises";
import { program } from 'commander'
import chalk from 'chalk';
import path from 'path'
import jsonpath from 'jsonpath'
import { existsSync } from 'fs';

(async () => {
  program
    .requiredOption('-d, --dataset <path>', 'Path to JSON file with the dataset.')
    .option('-o, --output <path>', 'Path to JSON file where the output will be stored')
    .requiredOption('-s, --script <path>', 'Path to scrapping script.')
    .requiredOption('-q, --query <jsonPath>', 'path to elements in datapath', '$')
    .option('-p, --pretty', 'Store dataset in pretty JSON format')
    .option('-t, --dryrun', 'Run JSON Path query without actual scraping')
    .requiredOption('-w, --delay', 'Delay in ms before each item scrap', 500)
    .requiredOption('-l, --limit <int>', 'maximum number of items to scrap', Number.MAX_VALUE)

  program.parse();
  const options = program.opts();

  const limit = options.limit
  const dataPath = path.resolve(options.dataset)
  const workdir = path.dirname(dataPath)
  const projectName = path.basename(options.script, path.extname(options.script))
  const progressPath = path.resolve(workdir, `.${projectName}.progress.json`)
  let outputLocation
  if(options.output) {
    outputLocation = options.output
  } else {
    outputLocation = path.resolve(workdir, 'output.json')
  }
  const outputPath = path.resolve(outputLocation)

  async function getProgress() {
    console.log(progressPath)
    if(!existsSync(progressPath)) {
      return 0
    }
    const raw = await readFile(progressPath)
    const json = JSON.parse(raw)
    return json.step
  }
  

  console.log(chalk.bgYellow.bold("Starting Puppet Scraper"))
  console.log(chalk.yellow(`===========================================`))
  console.log(chalk.yellow(` - Script:       ${options.script}`))
  console.log(chalk.yellow(` - Dataset:      ${options.dataset}`))
  console.log(chalk.yellow(` - Output:       ${outputLocation}`))
  console.log(chalk.yellow(` - Query:        ${options.query}`))
  console.log(chalk.yellow(` - Limit:        ${limit === Number.MAX_VALUE ? "Off" : limit}`))
  console.log(chalk.yellow(` - Delay:        ${options.delay}ms`))
  console.log(chalk.yellow(` - Pretty:       ${options.pretty ? 'On' : 'Off'}`))
  console.log(chalk.yellow(` - Dry Run:      ${options.dryrun ? 'On' : 'Off'}`))
  console.log(chalk.yellow(`===========================================`))
  

  console.log(chalk.bgGreen("\nEnvironment Setup"))
  let progress = await getProgress()
  console.log("Current task progress: " + progress)

  // reading dataset and scripts
  console.log(chalk.bgGreen(`\nReading dataset`))
  let dataset
  if(progress === 0) {
    console.log(`data source: ${dataPath}`)
    dataset = await readFile(dataPath, 'utf8')
  } else {
    console.log(`restoring data source: ${dataPath}`)
    dataset = await readFile(outputPath, 'utf8')
  }
  console.log("Parsing dataset...")
  dataset = JSON.parse(dataset)
  const scriptPath = path.resolve(options.script)
  console.log("Loading script from " + scriptPath)
  const script = (await import(scriptPath)).default

  console.log(chalk.bgGreen("\nQuery dataset"))
  const dataPoints = jsonpath.query(dataset, options.query)
  const subQueries = jsonpath.paths(dataset, options.query).map(p => jsonpath.stringify(p))
  console.log("Data points found: " + dataPoints.length)

  console.log("Launching headless Chrome")
  const browser = await puppeteer.launch({headless: "new"});

  const initProgress = progress
  for(let i=initProgress; i < dataPoints.length && i < (initProgress + Number(limit)); i++) {
    const dataPoint = dataPoints[i]
    console.log(chalk.bgGreen(`\nScraping the web (${i+1}/${dataPoints.length})`))
    if(!(options.dryrun)) {
      await new Promise(done => setTimeout(done, Number(options.delay)))
      console.log("Opening new browser tab")
      const page = await browser.newPage();

      console.log("Parsing page data")
      const newDataPoint = await script(page, dataPoint)

      jsonpath.apply(dataset, subQueries[i], (v) => {
        return newDataPoint
      })

      console.log("Closing browser tab")
      await page.close();

      console.log(`Data serialization...`)
      const jsonOptions = options.pretty ? [null, 2] : []
      const raw = JSON.stringify(dataset, ...jsonOptions)
      console.log(`Writing to ${outputPath}` )
      writeFile(outputPath, raw)

      progress++
      console.log("Update task progress: ", progress)
      writeFile(progressPath, JSON.stringify({step: progress}))

      console.log(newDataPoint)

    } else {
      console.log("Entry data:")
      console.log(dataPoint)
      console.log("Dry Run Mode. Skip scraping")
    }
  }

  console.log(chalk.bgGreen(`\nDataset`))
  console.log(dataset)

  console.log(chalk.bgGreen("\nEnvironment Cleanup"))
  console.log("Closing headless Chrome")
  await browser.close();
  if(progress >= dataPoints.length) {
    await unlink(progressPath)
  }

  console.log(chalk.yellow("\nThe job is done. Bye!"))

})();