const CryptoTS = require("crypto-ts");
const axios = require("axios");
const cheerio = require("cheerio");
const url = require("url");
require("dotenv").config();

const homePage = process.env.GREYTHR_HOMEPAGE_URI;
const email = process.env.SLACK_EMAIL;
const employeeId = process.env.EMPLOYEE_ID;
const password = process.env.PASSWORD;
const slack_webhook = process.env.SLACK_NOTIFICATION_ENDPOINT;
const gothHomepage = "https://goth.greythr.com";

e = (key) => CryptoTS.AES.encrypt(password, key).toString();

let createNonce = () => {
  let t = "";
  const n = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let e = 0; e < 40; e++) {
    t += n.charAt(Math.floor(Math.random() * n.length));
  }
  return t;
};

const data = {
  nonce: createNonce(),
};

// this is a mock object to get the value from the script tag, or respnse, which sets the value in the sessionStorage of the browser
let sessionStorage = {
  setItem: (name, value) => (data[name] = value),
};

// this gets the homepage, used to generate a jsession id
axios
  .get(homePage)
  .then((res) => {
    jsessionCookie = res.headers["set-cookie"][0].split(";");
    data["jsession"] = jsessionCookie[0];
    // this gets the cdata like encryption key and access id
    return axios.get(`${homePage}/uas/portal/auth/login`);
  })
  .then((res) => {
    const $ = cheerio.load(res.data);
    script = $("head script");
    eval(script.text());
    /* 
	sessionStorage.setItem('oAuthLogoutUrl',"https:\/\/goth.greythr.com\/oauth2\/auth\/sessions\/login\/revoke");
	sessionStorage.setItem('oAuthRedirectUrl',"https:\/\/idp.greythr.com\/uas\/portal\/auth\/callback");
	sessionStorage.setItem('hydraFrontendServer',"https:\/\/goth.greythr.com\/");
	sessionStorage.setItem('oAuthAppSubDomain',"greythr.com");
	sessionStorage.setItem('requireHttps',"true");
	sessionStorage.setItem('hydraClient',"greythr");
	sessionStorage.setItem('encryptKey', "yrHBfSs!i650vb*N");
	sessionStorage.setItem('loginChallengeExpiryDuration', "10");
	sessionStorage.setItem('accessId', "2b7a78664b524177674b304d37686f7575776259676654312f4d6d37613735423730666f4265424c7772553d");
	sessionStorage.setItem('staticResourcePath', "https:\/\/uas-ui3.cdn.greytip.com\/static-master-43");
    */

    // gets the login challenge
    // and the csrf_insecure_cookie
    params = {
      response_type: "id_token token",
      client_id: "greythr",
      state: data["nonce"],
      redirect_uri: data["oAuthRedirectUrl"],
      scope: "openid offline",
      nonce: data["nonce"],
      access_id: data["accessId"],
      gt_user_token: "",
      origin_user: "",
    };
    return axios.get(`${gothHomepage}/oauth2/auth`, {
      params: params,
      maxRedirects: 0,
    });
  })
  .then()
  .catch((e) => {
    if (e.response.status == 302) {
      // csrf cookie
      cookie = e.response.headers["set-cookie"][0].split(";")[0];
      const index = cookie.indexOf("=");
      data["csrf_cookie"] = cookie.slice(index + 1);
      location = e.response.headers["location"];
      return axios.get(location);
    } else throw e;
  })
  .then((res) => {
    res.request.res.responseUrl;
    const $ = cheerio.load(res.data);
    script = $("head script");
    eval(script.text());
    login_challenge_url = res.request.res.responseUrl;
    login_challenge = url.parse(login_challenge_url).query.split("=");
    sessionStorage.setItem("loginChallenge", login_challenge[1]);

    return axios.get(
      `${homePage}/uas/v1/initiate-login/${data["loginChallenge"]}`,
      {
        headers: {
          "X-Oauth-Challenge": data["loginChallenge"],
          Cookie: `JSESSIONID:${data["jsession"]}`,
        },
      },
    );
  })
  .then((res) => {
    // this does the actual login api call
    return axios.post(
      `${homePage}/uas/v1/login`,
      {
        userName: employeeId,
        password: e(data["encryptKey"]),
      },
      {
        headers: {
          "X-Oauth-Challenge": data["loginChallenge"],
          Cookie: `JSESSIONID:${data["jsession"]}`,
        },
      },
    );
  })
  .then((res) => {
    // geneates the redirect url
    return axios.get(res.data.redirectUrl, {
      headers: {
        Cookie: `oauth2_authentication_csrf_insecure=${data["csrf_cookie"]}`,
      },
      maxRedirects: 0,
    });
  })
  .then(() => {})
  .catch((e) => {
    if (e.response.status == 302) {
      // csrf cookie and consent_csrf_cookie
      csrf_cookie = e.response.headers["set-cookie"][0].split(";")[0];
      consent_cookie = e.response.headers["set-cookie"][1].split(";")[0];
      const csrf_index = csrf_cookie.indexOf("=");
      const consent_index = consent_cookie.indexOf("=");
      data["csrf_cookie"] = csrf_cookie.slice(csrf_index + 1);
      data["consent_cookie"] = consent_cookie.slice(consent_index + 1);
      location = e.response.headers["location"];
      return axios.get(location, {
        maxRedirects: 0,
      });
    } else {
      throw e;
    }
  })
  .then((res) => {})
  .catch((e) => {
    // another redirect
    // we need to handle this redirect since the request requires the cookie inorder to generate the access_token
    if (e.response.status == 301) {
      location = e.response.headers["location"];
      return axios.get(location, {
        headers: {
          Cookie: `oauth2_authentication_csrf_insecure=${data["csrf_cookie"]}; oauth2_consent_csrf_insecure=${data["consent_cookie"]}`,
        },
        maxRedirects: 0,
      });
    } else {
      throw e;
    }
  })
  .then((res) => {})
  .catch((e) => {
    if (e.response.status == 303) {
      // make the token to authorize with bluealtair domain
      location = e.response.headers["location"];
      params = url.parse(location).hash.slice(1).split("&");
      access_token = params[0].split("=");
      data["accessToken"] = access_token[1];
      return axios.post(
        `https://idp.greythr.com/uas/v1/initiate/callback`,
        {},
        { headers: { "Access-Token": data["accessToken"] } },
      );
    } else throw e;
  })
  .then(() => {
    // marks the attendance
    return axios.post(
      `${homePage}/v3/api/attendance/mark-attendance`,
      {},
      {
        params: {
          action: "Signin",
        },
        headers: {
          Cookie: `access_token=${data["accessToken"]}`,
        },
      },
    );
  })
  .then(() => {
    // signes out after the attendance is complete
    return axios.post(
      `${homePage}/v3/api/attendance/mark-attendance`,
      {},
      {
        params: {
          action: "SignOut",
        },
        headers: {
          Cookie: `access_token=${data["accessToken"]}`,
        },
      },
    );
  })
  .then(() => {
    if (slack_webhook) {
      d = new Date();
      return axios.post(slack_webhook, {
        message: `Hi! Your attendance for the day was marked successfully at ${d.getHours()}:${d.getMinutes()}:${d.getSeconds()}`,
        user_email: email,
      });
    } else {
      console.log("Login to gerythr successfull");
    }
  })
  .then()
  .catch((e) => {
    if (slack_webhook) {
      axios
        .post(slack_webhook, {
          message: "Hi! There was error signing in to greythr",
          user_email: email,
        })
        .then()
        .catch((e) => console.log("error notifiying to the user", e));
      console.log(e);
    } else {
      console.error("Error signing to greythr!");
    }
  });
