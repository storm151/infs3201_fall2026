import * as fs from 'fs/promises'

/** Reads and parses a JSON file. */
export async function readJsonFile(filePath) {
    const fileContents = await fs.readFile(filePath, 'utf8')
    return JSON.parse(fileContents)
}

/** Writes data to a JSON file. */
export async function writeJsonFile(filePath, data) {
    await fs.writeFile(filePath, JSON.stringify(data, null, 4))
}