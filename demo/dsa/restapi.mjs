// import { axios } from "https://cdn.jsdelivr.net/npm/axios/dist/axios.min.js"; //needs axios to be included
import "https://cdn.jsdelivr.net/npm/axios/dist/axios.min.js"; //needs axios to be included

export class REST {
    constructor(prefix) {

        axios.interceptors.response.use((response) => {
            return response;
        }, (error) => {
            // console.log('Intercepted error',error)
            if (error.config.retry) {
                let retryAfter = error.config.retry(error.response);
                if (retryAfter > 0)
                    return setTimeout(() => axios.request(error.config), retryAfter);
            }
            return Promise.reject(error);
        });

        this.basicauth = null;
        this.token = null;
        var _this = this;
        // console.log('Token:',this.token)
        const api = function (type, endpoint, options = {}) {
            //endpoint=format(endpoint,data);
            let params = options.params ? options.params : {}; //query params
            let data = options.data; //body
            let headers = options.headers ? options.headers : {}; //headers to set




            //if(!headers.cookie) headers.cookie=''; 
            //console.log('REST API called, token=',_this.token)
            //console.log('Cookie?',headers.cookie.match(/girderToken=([^\s;]+)/))
            //if(_this.token && !params.token) params.token = _this.token
            if (_this.basicauth && !params.token && !_this.token) {
                headers['Authorization'] = 'Basic ' + _this.basicauth;
            }
            if (!headers['Girder-Token'] && _this.token) {
                headers['Girder-Token'] = _this.token;
            }

            let axParams = {
                method: type,
                url: prefix + '/' + format(endpoint, params),
                data: data,
                params: params,
                retry: options.retry,
                headers: headers,
            };
            if (options.parse == false) {
                axParams.transformResponse = res => { return res; };
            }
            if (options.noCache){
                let ts = `timestamp=${Date.now()}`;
                if(axParams.url.includes('?')){
                    axParams.url = axParams.url + '&' + ts;
                } else {
                    axParams.url = axParams.url + '?' + ts;
                }
            }
            // console.log(axParams)
            let ax = axios(axParams).then(function (res) { return res.data || { status: res.status }; }).catch(error => {
                console.log('Axios error:', error);
                return Promise.reject(error);
            });
            //console.log(ax);
            return ax;
        };
        api.get = function (endpoint, data = {}) {
            return api('get', endpoint, data);
        };
        api.post = function (endpoint, data = {}) {
            return api('post', endpoint, data);
        };
        api.put = function (endpoint, data = {}) {
            return api('put', endpoint, data);
        };
        api.delete = function (endpoint, data = {}) {
            return api('delete', endpoint, data);
        };
        api.setbasicauth = function (auth) {
            _this.basicauth = auth;
            _this.token = null; //clear token if trying to re-login
            return api;
        };
        api.setapi_key = function (apikey) {
            let retrier = (() => {
                let retryCounter = 1;
                return (response) => {
                    console.log('Retrying', response);
                    if (response.status < 500)
                        return 0;
                    if (retryCounter > 10)
                        return 0;
                    let msInterval = retryCounter * retryCounter * 1000;
                    retryCounter++;
                    console.log(`Auth token request unsuccessful: Reponse status ${response.status} - ${response.statusText}. Retrying in ${msInterval}.`);
                    return msInterval;
                };
            })();
            api.post('api_key/token', { params: { key: apikey }, retry: retrier }).then(res => {
                console.log('Token received', res.data.authToken.token);
                _this.token = res.data.authToken.token;
            }).catch(e => console.log('Failed to set api key', e));
        };
        api.settoken = function (token) {
            _this.token = token;
        };
        api.gettoken = function () {
            return _this.token;
        };
        api.url = function (endpoint, params) {
            let url = prefix + '/' + format(endpoint, params);
            if (Object.keys(params).length > 0) {
                url += '?' + Object.keys(params).map(k => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`).join('&');
            }
            return url;
        };

        function format(endpoint, params = {}) {

            return endpoint.replace(/(\{[a-zA-Z0-9_\-]+\})/g, function (_, m) {
                var str = params[m];
                delete (params[m]);
                return str;
            });
        }

        return api;
    }
};