var express = require('express');
var router = express.Router();
const { Process } = require('../process');
var cors = require('cors');
const draw  = require('../drawCard');
const matter = require("gray-matter");
const md = require("markdown-it")({ html: true });
const path = require('path');
const fs = require('fs');
var url = require('url');
const axios = require('axios');

/**
 * Global variables
 */
const avatarPath    = "public/images/avatar/";
const directoryPath = path.join(__dirname, '../'.concat(avatarPath));

router.options('*', cors());

/**
 * Generate card
 * Params: {
 *  username: string
 *  displayBadges: boolean
 *  displayHeader: boolean
 *  refresh: boolean
 *  headerColor: string HEX color
 *  nameColor: string HEX color
 *  subHeaderColor: string HEX color
 *  badgeLabelColor: string HEX color
 *  foreground: string HEX color
 * }
 */
router.get('/card', async (req, res, next) => {
  let appURL          = req.protocol + '://' + req.get('host');
  let username        = req.query.username;
  if (!username) {
    res.render('user-not-found', { title: 'User Not Found', userName: username, appURL: appURL, error: "User not found" });
  }
  let displayBadges   = (undefined === req.query.badges) ? 'true' : req.query.badges;
  let displayHeader   = (undefined === req.query.header) ? 'true' : req.query.header;
  let refresh         = (undefined === req.query.refresh) ? 'false' : req.query.refresh;
  let headerColor     = (undefined === req.query.headerColor) ? '191E23' : req.query.headerColor;
  let nameColor       = (undefined === req.query.nameColor) ? '191E23' : req.query.nameColor;
  let subHeaderColor  = (undefined === req.query.subHeaderColor) ? '82878C;' : req.query.subHeaderColor;
  let badgeLabelColor = (undefined === req.query.badgeLabelColor) ? '23282D;' : req.query.badgeLabelColor;
  let foreground      = (undefined === req.query.foreground) ? 'ffffff' : req.query.foreground;
  let displayAvatar   = (undefined === req.query.avatar) ? 'true' : req.query.avatar; // TODO
  
  let userData      = [];

  try {
    const process       = new Process(username);
    userData            = await process.processCard();
    const name          = userData["name"];
    const initials      = name.charAt(0) + name.substring(name.lastIndexOf(" ") + 1 ).charAt(0);
    const membersince   = userData["memberSince"];
    let avatar          = userData["avatar"];
    const badges        = await draw.renderBadgesSVG(userData["badges"], displayBadges);
    const badgesCount   = userData["badges"].length;
    const defaultHeight = ('true' === displayHeader) ? 145 : 50; // Reduced height when header is hidden
    const dynHeight     = ('true' === displayBadges) ? (defaultHeight + (32 * Math.floor((badgesCount > 4) ? badgesCount / 2 : badgesCount)) + ((badgesCount % 2 === 0) ? 0 : 30)) : defaultHeight;

    try {

      if (!fs.existsSync(avatarPath)) {
        fs.mkdirSync(avatarPath);
      }

      if (!fs.existsSync(avatarPath + username + '/card.svg') || ('true' === refresh)) {

        if (!fs.existsSync(avatarPath + username)) {
          fs.mkdirSync(avatarPath + username);
        }

        const response = await axios.get(avatar, {
          responseType: 'arraybuffer',
        });

        const base64 = Buffer.from(response.data, 'binary').toString('base64');
        const contentType = response.headers['content-type'];
        const base64Image = `data:${contentType};base64,${base64}`;

        let htmlResult = await draw.renderCard(username, name, initials, membersince, base64Image, badges, dynHeight, displayHeader, headerColor, nameColor, subHeaderColor, badgeLabelColor, foreground);

        fs.writeFileSync(avatarPath + username + '/card.svg', htmlResult);
        console.log('✅ SVG created with embedded image.');
      }

      res.setHeader(
        'Content-Security-Policy',
        "img-src * 'self' data: https:;",
      );
      res.setHeader('Content-Type', "image/svg+xml");
      res.sendFile(path.join(__dirname, '../' + avatarPath, username + '/card.svg'));

      } catch (err) {
        console.error('❌ Error creating SVG:', err);
      }

  } catch (err) {
    res.render('user-not-found', { title: 'User Not Found', userName: username, appURL: appURL, error: err });
  }
});
/**
 * Check user profile
 * Params: {
 *  username: string
 * }
 */
router.get('/json', cors(), async (req, res, next) => {
  res.setHeader('Content-Type', 'application/json');
  let username = req.query.username;
  if (!username) {
    return res.status(400).json({ error: 'Missing username parameter' });
  }

  try {
    const process       = new Process(username);
    userData            = await process.processCard();
    res.end(JSON.stringify(userData));
  } catch (err) {
    res.status(404).json({ error: 'Error checking profile data', details: err.message });
  }
});

/**
 * Render index page with readme content
 */
router.get('/', async (req, res, next) => {
  try {
    const readme  = matter.read(__basedir + "/readme.md");
    const content = readme.content;
    const html    = md.render(content);

    res.render('index', { title: 'Welcome to CardPress - WordPress Profile Card', postContent: html });
  } catch (err) {
    next(err);
  }
});

/**
 * Render changelog page with changelog content
 */
router.get('/changelog', async (req, res, next) => {
  try {
    const readme  = matter.read(__basedir + "/changelog.md");
    const content = readme.content;
    const html    = md.render(content);

    res.render('index', { title: 'CardPress - WordPress Profile Card - Changelog', postContent: html });
  } catch (err) {
    next(err);
  }
});

/**
 * Render users page with list of users
 */
router.get('/users', async (req, res, next) => {

  try {
    const directories   = await Process.getDirectories(directoryPath);

    var users = ''; 
    users += directories.length + " users found<br><br><section class='users-list'>";

    directories.forEach(dir => users 
      += "<div><span>User: " + dir + "</span> - "
      + "<a href='https://profiles.wordpress.org/" + dir + "' target='_blank'>WordPress</a> - "
      + "<a href='https://cardpress.us/card?username=" + dir + "' target='_blank'>CardPress</a> - "
      + "<span>" + Process.getDirectoryDateTime(directoryPath + "/" + dir).date + "</span> - " 
      + "<span>" + Process.getDirectoryDateTime(directoryPath + "/" + dir).time + "</span></div>"
      );
    
    users += "</section>";
    res.render('users', { title: 'CardPress - Users', postContent: users });
  } catch (err) {
    next(err);
  }

});


module.exports = router;
