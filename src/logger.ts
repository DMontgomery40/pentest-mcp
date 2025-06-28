/// <reference path="./node-nmap.d.ts" />

import fs from 'fs/promises';
import path from 'path';
import { ScanData, Host } from 'node-nmap'; // Use types from our d.ts file

// Use /tmp directory for logs to avoid read-only directory issues
const LOG_DIR = path.join('/tmp', 'pentest-mcp-logs');
const LOG_FILE = path.join(LOG_DIR, 'scan_report.md');

// Ensure the log directory exists
async function ensureLogDirExists(): Promise<void> {
  try {
    await fs.mkdir(LOG_DIR, { recursive: true });
  } catch (error) {
    console.error('Error creating log directory:', error);
    // Depending on requirements, might want to throw or handle differently
  }
}

// Helper to format nmap ScanData into a user-friendly markdown string
function formatScanDataToMarkdown(target: string, options: string[], data: ScanData | string | null): string {
  // Use template literals for easier string construction and readability
  let markdown = `## Scan Details - ${new Date().toISOString()}\\n\\n`;
  markdown += `*   **Target:** \\\`${target}\\\`\\n`; // Escaped backticks for markdown code format
  markdown += `*   **Options:** \\\`${options.length > 0 ? options.join(' ') : 'default'}\\\`\\n\\n`;

  if (typeof data === 'string') {
    // Handle error messages or simple string output
    markdown += `**Result:** Error or simple message\\n\\\`\\\`\\\`\\n${data}\\n\\\`\\\`\\\`\\n`; // Escaped backticks for markdown code block
  } else if (data && Object.keys(data).length > 0) {
    markdown += `**Results Summary:**\\n\\n`;
    for (const ip in data) {
      // Ensure we are accessing valid Host data
      if (!data[ip] || typeof data[ip] !== 'object') continue;
      const hostData = data[ip] as Host; // Type assertion based on our d.ts

      markdown += `### Host: ${hostData.hostname ? `${hostData.hostname} (${ip})` : ip}\\n\\n`;
      if (hostData.mac) {
        markdown += `*   **MAC Address:** ${hostData.mac}\\n`;
      }
      if (hostData.osNmap) {
        markdown += `*   **OS Guess:** ${hostData.osNmap}\\n`;
      }

      if (hostData.ports && hostData.ports.length > 0) {
        const openPorts = hostData.ports.filter(port => port.state === 'open');
        if (openPorts.length > 0) {
          markdown += `*   **Open Ports:**\\n`;
          markdown += `    | Port ID | Protocol | State | Service | Reason |\\n`;
          markdown += `    |---------|----------|-------|---------|--------|\\n`;
          openPorts.forEach(port => {
            // Use optional chaining for potentially missing service details
            markdown += `    | ${port.portId || 'N/A'} | ${port.protocol || 'N/A'} | ${port.state || 'N/A'} | ${port.service?.name || 'N/A'} | ${port.reason || 'N/A'} |\\n`;
          });
        } else {
           markdown += `*   No open ports found.\\n`;
        }
      } else {
        markdown += `*   Port scanning not performed or no ports reported.\\n`;
      }
      markdown += `\\n`; // Add space between hosts
    }
  } else {
    markdown += `**Result:** No relevant data returned from scan.\\n`;
  }

  markdown += `\\n---\\n\\n`; // Separator
  return markdown;
}

// Function to append formatted scan results to the markdown log file
export async function logScanResult(target: string, options: string[], results: ScanData | string | null): Promise<void> {
  await ensureLogDirExists();
  const formattedResult = formatScanDataToMarkdown(target, options, results);

  try {
    await fs.appendFile(LOG_FILE, formattedResult);
    console.log(`Scan result logged to ${LOG_FILE}`);
  } catch (error) {
    console.error('Error writing scan result to log file:', error);
  }
}

// Function to append general messages or errors to the log file
export async function logMessage(message: string): Promise<void> {
  await ensureLogDirExists();
  const timestamp = new Date().toISOString();
  // Format general messages simply within a code block
  const formattedMessage = `## Log Entry - ${timestamp}\\n\\n\\\`\\\`\\\`\\n${message}\\n\\\`\\\`\\\`\\n\\n---\\n\\n`;
  try {
    await fs.appendFile(LOG_FILE, formattedMessage);
    console.log(`Message logged to ${LOG_FILE}`);
  } catch (error) {
    console.error('Error writing message to log file:', error);
  }
}

// Function to retrieve the latest scan log entry for a specific target
export async function getLatestScanResultForTarget(target: string): Promise<string | null> {
  try {
    await ensureLogDirExists(); // Ensure directory/file potentially exists
    const logContent = await fs.readFile(LOG_FILE, 'utf-8');
    
    // Split the log into entries based on the separator
    const entries = logContent.split('\n---\n');
    
    // Search backwards for the latest entry matching the target
    // This simple regex looks for the target string after "Target:"
    // It assumes the target string doesn't contain regex special characters.
    // A more robust approach might parse the markdown structure.
    const targetRegex = new RegExp(`\*   \*\*Target:\*\*\\\`\`${target}\\\`\``, 'i');

    for (let i = entries.length - 1; i >= 0; i--) {
        const entry = entries[i].trim();
        if (entry.startsWith('## Scan Details') && targetRegex.test(entry)) {
            // Return the relevant scan details block
            return entry;
        }
    }
    
    return null; // No entry found for the target

  } catch (error: any) {
    // If file doesn't exist (ENOENT) or other read errors, return null
    if (error.code === 'ENOENT') {
        return null;
    }
    console.error(`Error reading log file to retrieve scan for target ${target}:`, error);
    return null; // Indicate failure to retrieve
  }
}
 