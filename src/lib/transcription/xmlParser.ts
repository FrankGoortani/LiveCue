/**
 * XML Parser for Otter.ai responses
 */
import { XMLParser } from 'fast-xml-parser';

export class XmlParser {
  private parser: XMLParser;

  constructor() {
    this.parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      isArray: (name, jpath, isLeafNode, isAttribute) => {
        // Common XML elements that should always be treated as arrays
        const arrayElements = [
          'speaker',
          'speech',
          'transcription',
          'segment',
          'folder',
          'group'
        ];
        return arrayElements.includes(name);
      }
    });
  }

  /**
   * Parse XML string to JavaScript object
   * @param xml - XML string to parse
   * @returns Parsed JavaScript object
   */
  public parse<T = any>(xml: string): T {
    try {
      return this.parser.parse(xml) as T;
    } catch (error) {
      console.error('Error parsing XML:', error);
      throw new Error('Failed to parse XML response');
    }
  }

  /**
   * Extract specific data from XML response
   * @param xml - XML string to parse
   * @param path - Path to extract (e.g., 'response.data')
   * @returns Extracted data
   */
  public extract<T = any>(xml: string, path: string): T {
    try {
      const parsed = this.parse(xml);
      return this.getValueByPath(parsed, path) as T;
    } catch (error) {
      console.error('Error extracting data from XML:', error);
      throw new Error('Failed to extract data from XML response');
    }
  }

  /**
   * Get value from object by dot-notation path
   * @param obj - Object to extract from
   * @param path - Dot-notation path (e.g., 'response.data')
   * @returns Extracted value
   */
  private getValueByPath(obj: any, path: string): any {
    return path.split('.').reduce((prev, curr) => {
      return prev && prev[curr] !== undefined ? prev[curr] : null;
    }, obj);
  }
}

// Create and export a singleton instance
export const xmlParser = new XmlParser();
