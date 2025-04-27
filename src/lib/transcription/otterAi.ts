/**
 * OtterAI Client for TypeScript
 * Based on the Python implementation, converted to TypeScript with proper typing
 */
import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';
import FormData from 'form-data';
import { createReadStream } from 'fs';
import { xmlParser } from './xmlParser';
import {
  OtterAiConfig,
  OtterAiCredentials,
  OtterAiEndpoints,
  OtterAiError,
  OtterAiFolder,
  OtterAiGroup,
  OtterAiLoginResponse,
  OtterAiNotificationSettings,
  OtterAiQueryParams,
  OtterAiSpeaker,
  OtterAiSpeech,
  OtterAiSpeechDetails,
  OtterAiUploadOptions,
  OtterAiUser,
} from './otterAiTypes';

export class OtterAi {
  private baseUrl: string;
  private client: AxiosInstance;
  private token: string | null = null;
  private userId: string | null = null;
  private email: string;
  private password: string;
  private csrfToken: string | null = null;
  private deviceUuid: string;

  /**
   * Create an OtterAI client instance
   * @param config - Configuration options
   */
  constructor(config: OtterAiConfig) {
    // Match the exact API endpoint
    this.baseUrl = config.baseUrl || 'https://otter.ai/forward/api/v1';
    console.log('[_DEBUG_] OtterAi constructor baseURL:', this.baseUrl);
    this.email = config.credentials.email;
    this.password = config.credentials.password;

    // Generate a device UUID that will persist for this instance
    this.deviceUuid = this.generateDeviceUuid();
    console.log('[_DEBUG_] OtterAi deviceUuid:', this.deviceUuid);

    // Create axios instance with cookie jar support for session persistence
    const jar = new CookieJar();
    const baseClient = axios.create({
      baseURL: this.baseUrl,
      withCredentials: true,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/plain, */*',
        'User-Agent': 'Mozilla/5.0 (compatible; LiveCue/1.0)',
        'x-client-version': 'Otter v3.73.2', // Match the client version from browser
      },
    });
    const clientWithJar = wrapper(baseClient);
    clientWithJar.defaults.jar = jar;
    this.client = clientWithJar as AxiosInstance;

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        const customError: OtterAiError = new Error(
          error.response?.data?.message || error.message || 'Unknown error'
        );
        customError.statusCode = error.response?.status;
        customError.response = error.response?.data;
        return Promise.reject(customError);
      }
    );
  }

  /**
   * Ensure client is authenticated before making API calls
   * @private
   */
  private async ensureAuthenticated(): Promise<void> {
    if (!this.token) {
      await this.login();
    }
  }

  /**
   * Add authentication token to request headers
   * @param config - Axios request config
   * @private
   */
  /**
   * Generate a device UUID in the format seen in the browser request
   * @private
   */
  private generateDeviceUuid(): string {
    // Format: 8-4-4-4-12 hexadecimal digits
    const s4 = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
    return `${s4()}${s4()}-${s4()}-${s4()}-${s4()}-${s4()}${s4()}${s4()}`;
  }

  /**
   * Add authentication headers including CSRF token if available
   * @private
   */
  private addAuthHeader(config: AxiosRequestConfig = {}): AxiosRequestConfig {
    const headers = {...(config.headers || {})};

    // Add CSRF token if available
    if (this.csrfToken) {
      headers['x-csrftoken'] = this.csrfToken;
    }

    return {
      ...config,
      headers
    };
  }

  /**
   * Format query parameters for URL
   * @param params - Query parameters
   * @private
   */
  private formatQueryParams(params: OtterAiQueryParams = {}): string {
    const queryParams = new URLSearchParams();

    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        queryParams.append(key, String(value));
      }
    });

    const queryString = queryParams.toString();
    return queryString ? `?${queryString}` : '';
  }

  /**
   * Initialize session with cookies by making a preflight request
   * @private
   */
  /**
   * Initialize session by getting CSRF token and initial cookies
   * @private
   */
  private async initializeSession(): Promise<void> {
    try {
      // Direct call to the login_csrf endpoint - this is what the browser does to obtain a valid CSRF token
      const loginCsrfUrl = 'https://otter.ai/forward/api/v1/login_csrf';
      console.log('[_DEBUG_] OtterAi.initializeSession making request to login_csrf endpoint:', loginCsrfUrl);

      try {
        // Make the request to get the CSRF token
        const csrfResponse = await axios.get(loginCsrfUrl, {
          withCredentials: true,
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; LiveCue/1.0)',
            'Accept': '*/*',
            'Referer': 'https://otter.ai/signin',
            'Origin': 'https://otter.ai',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
            'Content-Type': 'application/json'
          }
        });

        console.log('[_DEBUG_] Login CSRF endpoint status:', csrfResponse.status);
        console.log('[_DEBUG_] Login CSRF endpoint data:', csrfResponse.data);

        if (csrfResponse.headers && csrfResponse.headers['set-cookie']) {
          const setCookies = csrfResponse.headers['set-cookie'];
          console.log('[_DEBUG_] CSRF endpoint set-cookie headers:', setCookies);

          if (Array.isArray(setCookies)) {
            for (const cookie of setCookies) {
              if (cookie.includes('csrftoken=')) {
                const match = cookie.match(/csrftoken=([^;]+)/);
                if (match && match[1]) {
                  this.csrfToken = match[1];
                  console.log('[_DEBUG_] Extracted CSRF token from login_csrf endpoint:', this.csrfToken);
                  break;
                }
              }
            }
          }
        }
      } catch (csrfError) {
        console.log('[_DEBUG_] Error getting CSRF token:', csrfError);
      }

      // If we still don't have a CSRF token, try a fallback to the original method
      if (!this.csrfToken) {
        console.log('[_DEBUG_] Falling back to password page for CSRF token');
        const mainSiteUrl = 'https://otter.ai/password';

        const response = await axios.get(mainSiteUrl, {
          withCredentials: true,
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; LiveCue/1.0)',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8'
          }
        });

        if (response.headers && response.headers['set-cookie']) {
          const setCookies = response.headers['set-cookie'];

          if (Array.isArray(setCookies)) {
            for (const cookie of setCookies) {
              if (cookie.includes('csrftoken=')) {
                const match = cookie.match(/csrftoken=([^;]+)/);
                if (match && match[1]) {
                  this.csrfToken = match[1];
                  console.log('[_DEBUG_] Extracted CSRF token from password page:', this.csrfToken);
                  break;
                }
              }
            }
          }
        }
      }

      console.log('[_DEBUG_] Final CSRF token after initialization:', this.csrfToken);

      return;
    } catch (error) {
      console.log('[_DEBUG_] OtterAi.initializeSession error:', error);
      // Continue even if this fails - it's just preparation
    }
  }

  /**
   * Login to Otter.ai and obtain authentication token
   * @returns Login response with token and user info
   */
  public async login(): Promise<OtterAiLoginResponse> {
    try {
      // Initialize session cookies and get CSRF token first
      await this.initializeSession();

      console.log('[_DEBUG_] OtterAi.login request:', { email: this.email });

      // Create authentication header (Basic Auth)
      const authString = `${this.email}:${this.password}`;
      const base64Auth = Buffer.from(authString).toString('base64');
      const authHeader = `Basic ${base64Auth}`;

      // Build query parameters exactly as browser does
      const params = {
        username: this.email,
        tz_str: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Toronto',
        device_uuid: this.deviceUuid
      };

      // Log CSRF token status before request
      console.log('[_DEBUG_] CSRF token before login request:', this.csrfToken);

      // If we still don't have a CSRF token, try a fallback approach
      if (!this.csrfToken) {
        console.log('[_DEBUG_] No CSRF token found, trying to extract from cookie jar');
        // @ts-ignore: Access the cookie jar
        const cookieJar = this.client.defaults.jar;
        const cookies = cookieJar?.toJSON()?.cookies || [];
        const csrfCookie = cookies.find((cookie: any) => cookie.key === 'csrftoken');
        if (csrfCookie && csrfCookie.value) {
          this.csrfToken = csrfCookie.value;
          console.log('[_DEBUG_] Found CSRF token in cookie jar:', this.csrfToken);
        } else {
          // If still no token, create a random one as last resort
          this.csrfToken = Math.random().toString(36).substring(2);
          console.log('[_DEBUG_] Generated fallback CSRF token:', this.csrfToken);
        }
      }

      // Build request config to precisely match the successful browser request
      const requestConfig = {
        headers: {
          'Authorization': authHeader,
          'X-CSRFToken': this.csrfToken || '', // Use capital letters as seen in browser request
          'x-client-version': 'Otter v3.73.2',
          'Content-Length': '0', // Empty body POST
          'Referer': 'https://otter.ai/signin', // Match the exact Referer from successful request
          'Origin': 'https://otter.ai',
          'Accept': 'application/json, text/plain, */*',
          'Content-Type': 'application/json', // Add content-type header
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
        },
        params,
        withCredentials: true, // Ensure cookies are sent
      };

      // Explicitly set Cookie header if we have a CSRF token
      if (this.csrfToken) {
        // Use type assertion to add Cookie header (TypeScript doesn't know it's valid)
        (requestConfig.headers as any)['Cookie'] = `csrftoken=${this.csrfToken}`;
      }

      console.log('[_DEBUG_] OtterAi.login request config:', JSON.stringify(requestConfig));

      // Make POST request with empty body as seen in browser
      const loginUrl = `${this.baseUrl}/login`;
      console.log('[_DEBUG_] OtterAi.login full URL:', loginUrl);

      const response = await this.client.post(loginUrl, null, requestConfig);

      console.log('[_DEBUG_] OtterAi.login response data:', response.data, 'headers:', response.headers);

      // @ts-ignore: Access the cookie jar after login
      const cookieJar = this.client.defaults.jar;
      console.log('[_DEBUG_] OtterAi.login cookies after login:',
        cookieJar ? JSON.stringify(cookieJar.toJSON()) : 'No cookie jar');

      // Extract CSRF token from response cookies for future requests
      const cookies = cookieJar?.toJSON()?.cookies || [];

      // Update CSRF token from response cookies
      const csrfCookie = cookies.find((cookie: any) => cookie.key === 'csrftoken');
      if (csrfCookie && csrfCookie.value) {
        this.csrfToken = csrfCookie.value;
        console.log('[_DEBUG_] OtterAi.login updated CSRF token:', this.csrfToken);
      }

      // Use userid from response (not token like before)
      this.userId = response.data.userid;

      return response.data;
    } catch (error) {
      throw this.handleError(error, 'Failed to login to Otter.ai');
    }
  }

  /**
   * Get current user information
   * @returns User information
   */
  public async getUser(): Promise<OtterAiUser> {
    try {
      await this.ensureAuthenticated();

      const response = await this.client.get<OtterAiUser>(
        OtterAiEndpoints.USER,
        this.addAuthHeader()
      );

      return response.data;
    } catch (error) {
      throw this.handleError(error, 'Failed to get user information');
    }
  }

  /**
   * Get all speakers for the current user
   * @returns List of speakers
   */
  public async getSpeakers(): Promise<OtterAiSpeaker[]> {
    try {
      await this.ensureAuthenticated();

      const response = await this.client.get<{ speakers: OtterAiSpeaker[] }>(
        OtterAiEndpoints.SPEAKERS,
        this.addAuthHeader()
      );

      return response.data.speakers || [];
    } catch (error) {
      throw this.handleError(error, 'Failed to get speakers');
    }
  }

  /**
   * Get all speeches for the current user
   * @param params - Query parameters
   * @returns List of speeches
   */
  public async getSpeeches(params: OtterAiQueryParams = {}): Promise<OtterAiSpeech[]> {
    try {
      await this.ensureAuthenticated();

      const queryString = this.formatQueryParams(params);
      const response = await this.client.get<{ speeches: OtterAiSpeech[] }>(
        `${OtterAiEndpoints.SPEECHES}${queryString}`,
        this.addAuthHeader()
      );

      return response.data.speeches || [];
    } catch (error) {
      throw this.handleError(error, 'Failed to get speeches');
    }
  }

  /**
   * Get a specific speech by ID
   * @param speechId - Speech ID
   * @returns Speech details including transcription
   */
  public async getSpeech(speechId: string): Promise<OtterAiSpeechDetails> {
    try {
      await this.ensureAuthenticated();

      const response = await this.client.get<OtterAiSpeechDetails>(
        `${OtterAiEndpoints.SPEECH}/${speechId}`,
        this.addAuthHeader()
      );

      return response.data;
    } catch (error) {
      throw this.handleError(error, `Failed to get speech: ${speechId}`);
    }
  }

  /**
   * Query speech transcription with search terms
   * @param speechId - Speech ID
   * @param query - Search query
   * @returns Speech details with matching transcription segments
   */
  public async querySpeech(speechId: string, query: string): Promise<OtterAiSpeechDetails> {
    try {
      await this.ensureAuthenticated();

      const response = await this.client.get<OtterAiSpeechDetails>(
        `${OtterAiEndpoints.SPEECH_QUERY}/${speechId}`,
        this.addAuthHeader({
          params: { query },
        })
      );

      return response.data;
    } catch (error) {
      throw this.handleError(error, `Failed to query speech: ${speechId}`);
    }
  }

  /**
   * Upload audio file to Otter.ai
   * @param filePath - Path to audio file
   * @param options - Upload options
   * @returns Uploaded speech details
   */
  public async uploadSpeech(filePath: string, options: OtterAiUploadOptions): Promise<OtterAiSpeech> {
    try {
      await this.ensureAuthenticated();

      const form = new FormData();
      form.append('title', options.title);

      if (options.description) {
        form.append('description', options.description);
      }

      if (options.speakers && options.speakers.length > 0) {
        options.speakers.forEach((speaker, index) => {
          form.append(`speaker[${index}]`, speaker);
        });
      }

      if (options.groupId) {
        form.append('groupId', options.groupId);
      }

      if (options.folderId) {
        form.append('folderId', options.folderId);
      }

      // Add file as last item
      form.append('file', createReadStream(filePath));

      const response = await this.client.post<OtterAiSpeech>(
        OtterAiEndpoints.UPLOAD,
        form,
        this.addAuthHeader({
          headers: {
            ...form.getHeaders(),
            'Content-Type': 'multipart/form-data',
          },
        })
      );

      return response.data;
    } catch (error) {
      throw this.handleError(error, 'Failed to upload speech');
    }
  }

  /**
   * Move a speech to the trash bin
   * @param speechId - Speech ID
   * @returns Success status
   */
  public async moveToTrashBin(speechId: string): Promise<boolean> {
    try {
      await this.ensureAuthenticated();

      await this.client.post(
        `${OtterAiEndpoints.TRASH}/${speechId}`,
        {},
        this.addAuthHeader()
      );

      return true;
    } catch (error) {
      throw this.handleError(error, `Failed to move speech to trash: ${speechId}`);
    }
  }

  /**
   * Create a new speaker
   * @param name - Speaker name
   * @returns Created speaker
   */
  public async createSpeaker(name: string): Promise<OtterAiSpeaker> {
    try {
      await this.ensureAuthenticated();

      const response = await this.client.post<OtterAiSpeaker>(
        OtterAiEndpoints.SPEAKERS,
        { name },
        this.addAuthHeader()
      );

      return response.data;
    } catch (error) {
      throw this.handleError(error, 'Failed to create speaker');
    }
  }

  /**
   * Get notification settings
   * @returns Notification settings
   */
  public async getNotificationSettings(): Promise<OtterAiNotificationSettings> {
    try {
      await this.ensureAuthenticated();

      const response = await this.client.get<OtterAiNotificationSettings>(
        OtterAiEndpoints.NOTIFICATION_SETTINGS,
        this.addAuthHeader()
      );

      return response.data;
    } catch (error) {
      throw this.handleError(error, 'Failed to get notification settings');
    }
  }

  /**
   * List all groups
   * @returns List of groups
   */
  public async listGroups(): Promise<OtterAiGroup[]> {
    try {
      await this.ensureAuthenticated();

      const response = await this.client.get<{ groups: OtterAiGroup[] }>(
        OtterAiEndpoints.GROUPS,
        this.addAuthHeader()
      );

      return response.data.groups || [];
    } catch (error) {
      throw this.handleError(error, 'Failed to list groups');
    }
  }

  /**
   * Get all folders
   * @returns List of folders
   */
  public async getFolders(): Promise<OtterAiFolder[]> {
    try {
      await this.ensureAuthenticated();

      const response = await this.client.get<{ folders: OtterAiFolder[] }>(
        OtterAiEndpoints.FOLDERS,
        this.addAuthHeader()
      );

      return response.data.folders || [];
    } catch (error) {
      throw this.handleError(error, 'Failed to get folders');
    }
  }

  /**
   * Handle errors and provide meaningful error messages
   * @param error - Error object
   * @param defaultMessage - Default error message
   * @private
   */
  private handleError(error: any, defaultMessage: string): OtterAiError {
    if (error.statusCode) {
      // Already processed by interceptor
      return error;
    }

    const customError: OtterAiError = new Error(defaultMessage);
    customError.statusCode = error.response?.status;
    customError.response = error.response?.data;

    return customError;
  }
}
