const Discord = require("discord.js");
const Twitter = require('twitter-lite');
const axios = require('axios');
const { Interval, IntervalComposite } = require('intervals-composite');
const intervals = new IntervalComposite('intervals');
const _ = require('lodash');
const fs = require('fs');
const config = JSON.parse(fs.readFileSync("./config/config.json"));
//
const errors = ["Cannot convert undefined to a BigInt", "Error: connect ETIMEDOUT", "Error: read ECONNRESET"]

const T = new Twitter({
    consumer_key:  config.consumer_key,
    consumer_secret:  config.consumer_secret,
    access_token_key:  config.access_token_key,
    access_token_secret:  config.access_token_secret
})

const client = new Discord.Client();
const admin_ids = config.admins
const token = config.token

const commands = [config.prefix+"add ", config.prefix+"delete ", config.prefix+"clear", config.prefix+"setwebhook", config.prefix+"monitors", config.prefix+"help"]

var global_webhook
try{
    global_webhook = new Discord.WebhookClient(config.hook_id, config.hook_token);
}
catch(e){}

var delay = 1000

var tweets = {}
var monitors = {}

function init(){
    const accounts = config.accounts
    for (var i = 0; i < accounts.length; i++){
        const name = accounts[i].name
        const channel = accounts[i].channel
        setIntervals(name, channel)
    }
}

function setIntervals(name, channel_id){
    if(tweets[name] == undefined){
        tweets[name] = {"tweet": ""}
    }
    if(!intervals.has(name)){
        intervals.add(new Interval({
            label: name,
            cb: () => {monitor_Tweets(name)},
            ms: delay
        }));
    }
    monitors[name] = name
    intervals.get(name).start()
}

client.on("message", (message) => {
    try{
        if(commands.some(cmd => message.content.startsWith(cmd))){
            const server_id = message.guild.id
            const server_name = (message.guild != null) ? (message.guild.name) : "Guild"
            var server_icon = message.guild.iconURL({"format": "png"})
            if (server_icon == undefined){
                server_icon = ""
            }
            const command = message.content.split(/ +/g)[0]
            const msg = message.content.slice(command.length).trim()
            const args = msg.split(" ")
            //
            console.log("`"+message.content+"`: `"+message.author.tag+"` in `"+message.channel.name+"` channel")
            //
            if (message.content.startsWith(config.prefix+"add ")) {
                const name = args[0].toLowerCase()
                if(monitors[name] == undefined){
                    T.get("users/show", { screen_name: name }).then(results => {
                        setIntervals(name)
                        config.accounts.push({name: name})
                        fs.writeFile('./config/config.json', JSON.stringify(config, null, 4), "utf-8", ((err) => {if(err){console.error(err)}}))
                        var embed = new Discord.MessageEmbed()
                        embed.setTitle("@"+name.charAt(0).toUpperCase()+name.slice(1))
                        embed.setDescription("Account **added** successfully.")
                        embed.setURL("https://twitter.com/"+name)
                        embed.setThumbnail(results.profile_image_url_https)
                        embed.setFooter(server_name, server_icon)
                        embed.setTimestamp(new Date())
                        embed.setColor("GREEN")
                        message.channel.send(embed)
                        T.post("friendships/create", {screen_name: name})
                        .catch(e => {
                            if ('errors' in e) {
                                if(e.errors[0].code ==  32){
                                    console.error("Could not authenticate.")
                                }
                                else if(!e.errors[0].message.includes("You can't follow yourself")){
                                    console.error(e.errors[0])
                                }
                            }
                            else {
                                const _e = e.toString()
                                if (!(errors.some(error => _e.includes(error)))){
                                    errors_log_hook.send("```"+e+"```")
                                    console.error(e)
                                    console.log("Resuming")
                                }
                            }
                        })
                    })
                    .catch(e => {
                        if ('errors' in e) {
                            if(e.errors[0].message.includes("User not found")){
                                console.log("User "+name+" not found.")
                                message.channel.send(":no_entry_sign: | Didn't find any twitter account with screen name `"+name+"`.")
                            }
                            else if(e.errors[0].message.includes("User has been suspended.")){
                                console.error(e.errors[0])
                                message.channel.send(":no_entry_sign: | Can't add `"+name+"`, because it is suspended.")
                            }
                            else{
                                console.error(e.errors[0])
                                message.channel.send(":no_entry_sign: | An unexpected error occured, didn't add `"+name+"`.")
                            }
                        }
                        else {
                            message.channel.send(":no_entry_sign: | An unexpected error occured.")
                            console.error(e)
                        }
                    })
                }
                else{
                    message.channel.send(":no_entry_sign: | There's already a monitor for that account.")
                }
            }
            else if (message.content.startsWith(config.prefix+"delete ")) {
                const name = args[0].toLowerCase()
                if(monitors[name] != undefined){
                    try{
                        delete monitors[name];
                        intervals.get(name).clear()
                        const a = _.findIndex(config.accounts, function(account) { return account.name == name})
                        config.accounts.splice(a, 1)
                        fs.writeFile('./config/config.json', JSON.stringify(config, null, 4), "utf-8", ((err) => {if(err){console.error(err)}}))
                        T.get("users/show", { screen_name: name }).then(results => {
                            var embed = new Discord.MessageEmbed()
                            embed.setTitle("@"+name.charAt(0).toUpperCase()+name.slice(1))
                            embed.setDescription("Account **deleted** successfully.")
                            embed.setURL("https://twitter.com/"+name)
                            embed.setThumbnail(results.profile_image_url_https)
                            embed.setFooter(server_name, server_icon)
                            embed.setTimestamp(new Date())
                            embed.setColor("GREEN")
                            message.channel.send(embed)
                        })
                    }
                    catch(e){console.error(e)}
                }
                else{
                    message.channel.send(":no_entry_sign: | There's no monitor for that account.")
                }
            }
            else if (message.content.startsWith(config.prefix+"clear")) {
                var accounts = []
                var mon = []
                for (let name of Object.keys(monitors)) {
                    accounts.push(name)
                    mon.push("[@"+name.charAt(0).toUpperCase()+name.slice(1)+"](https://twitter.com/"+name+")")
                    delete monitors[name]
                    intervals.get(name).clear()
                }
                var accounts_length = accounts.length
                if (accounts_length > 0){
                    config.accounts = []
                    fs.writeFile('./config/config.json', JSON.stringify(config, null, 4), "utf-8", ((err) => {if(err){console.error(err)}}))
                    //
                    const embed = new Discord.MessageEmbed()
                    embed.setAuthor("All monitors cleared.", "https://i.imgur.com/plZbXbQ.png")
                    embed.addField("Handles:", mon.join('\n')+'\n', true)
                    embed.setFooter(server_name, server_icon)
                    embed.setTimestamp(new Date())
                    embed.setColor("GREEN")
                    message.channel.send(embed)
                }
                else{
                    return message.channel.send(":no_entry_sign: | There are no global monitors to clear.")
                }     
            }
            else if (message.content.startsWith(config.prefix+"setwebhook")) {
                const url = args[0]
                if (url.includes("https://discordapp.com/api/webhooks/") || url.includes("https://discord.com/api/webhooks/")){
                    const webhook = url.split("/")
                    const webhook_token = webhook[webhook.length-1]
                    const webhook_id = webhook[webhook.length-2]
                    const hook = new Discord.WebhookClient(webhook_id, webhook_token);
                    message.guild.fetchWebhooks()
                    .then((webhooks) =>{
                        const result = webhooks.find(val => val.id == webhook_id)
                        if (result != undefined){
                            config.hook_id = webhook_id
                            config.hook_token = webhook_token
                            fs.writeFile('./config/config.json', JSON.stringify(config, null, 4), "utf-8", ((err) => {if(err){console.error(err)}}))
                            global_webhook = new Discord.WebhookClient(webhook_id, webhook_token);
                            message.channel.send(":white_check_mark: | Webhook set successfully.")
                        }
                        else{
                            message.channel.send(":no_entry_sign: | That webhook isn't in this server.")
                        }
                    })
                    .catch(e => {
                        console.error(e)
                        if(e.toString().includes("DiscordAPIError: Missing Permissions")){
                            message.channel.send(":no_entry_sign: | Missing permissions, make sure the bot has a role with enough permissions.")
                        }
                    })
                }
                else{
                    message.channel.send(":no_entry_sign: | Please use a valid webhook url.")
                }
            }
            else if (message.content.startsWith(config.prefix+"monitors")) {
                var mon = []
                for (let name of Object.keys(monitors)) {
                    mon.push("[@"+name.charAt(0).toUpperCase()+name.slice(1)+"](https://twitter.com/"+name+")")
                }
                var mon_length = mon.length
                if (mon_length > 0){
                    const embed = new Discord.MessageEmbed()
                    embed.setAuthor("Accounts monitored.", "https://i.imgur.com/plZbXbQ.png")
                    embed.addField("Handles:", mon.join('\n')+'\n', true)
                    embed.setFooter(server_name, server_icon)
                    embed.setTimestamp(new Date())
                    embed.setColor("BLUE")
                    message.channel.send(embed)
                }
                else{
                    message.channel.send(":no_entry_sign: | There are no active monitors.")
                }
            }
            else if (message.content.startsWith(config.prefix+"help")) {
                const embed = new Discord.MessageEmbed()
                .setAuthor("Commands", message.author.displayAvatarURL({format: 'png'}))
                .setColor('BLUE')
                .addField(config.prefix+"add", "Adds a new monitor,  E.g. `"+config.prefix+"add twitter_account_name`.")
                .addField(config.prefix+"delete", "Deletes a monitor,  E.g. `"+config.prefix+"delete twitter_account_name`.")
                .addField(config.prefix+"clear", "Deletes all monitors.")
                .addField(config.prefix+"setwebhook", "Sets the webhook url, E.g. `"+config.prefix+"setwebhook https://discord.com/api/webhooks/6848...`.")
                .addField(config.prefix+"monitors", "Lists all the active monitors in this server.")
                message.channel.send({embed});
            }
            //config.server_id = server_id
            //config.server_name = server_name
            //config.server_icon = server_icon
            //fs.writeFile('./config/config.json', JSON.stringify(config, null, 4), "utf-8", ((err) => {if(err){console.error(err)}}))
        }
    }
    catch(e){console.log("Command Error");console.error(e);message.channel.send(":interrobang: | An unexpected error occured, please retry.")}
})

function monitor_Tweets(name){
    try {
        const url = "https://api.twitter.com/1.1/statuses/user_timeline.json?count=1&include_rts=false&exclude_replies=false&screen_name="+name+"&include_entities=1&include_user_entities=1&send_error_codes=1&tweet_mode=extended"
        const headers = {
            'Authorization': 'Bearer AAAAAAAAAAAAAAAAAAAAAF7aAAAAAAAASCiRjWvh7R5wxaKkFp7MM%2BhYBqM%3DbQ0JPmjU9F6ZoMhDfI4uTNAaQuTDm2uO9x3WFVr2xBZ2nhjdP0',
            'X-Csrf-Token': 'e9d8f4e93fc7d84b16266a1e2db09396',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:78.0) Gecko/20100101 Firefox/78.0',
            'Cookie': 'ct0=e9d8f4e93fc7d84b16266a1e2db09396;auth_token=fbc6d55b17de8faba9e7cd163dbbed8c61ad18c9;',
            'cache-control': 'no-cache, no-store',
            'pragma': 'no-cache'
        }
        axios.get(url, {headers: headers}, {timeout: 1000}).then(response => {
            const timeline = response.data
            if(timeline.length > 0){
                const tweet = timeline[0]
                if(tweets[name].tweet == ""){
                    //First time
                    tweets[name].tweet = tweet.id_str
                }
                else{
                    //Every other time
                    var tweet_id = tweet.id_str
                    var last_tweet_id = BigInt(tweets[name].tweet)
                    if(BigInt(tweet_id) > last_tweet_id){
                        //console.time(name)
                        tweets[name].tweet = tweet_id
                        try{
                            global_webhook.send("https://twitter.com/"+name+"/status/"+tweet_id+"/")
                        }
                        catch(e){
                            console.error(e)
                        }
                    }
                }
            }
        })
        .catch(error => {
            if (error.hasOwnProperty("response")) {
                if(error.response != undefined){
                    console.log("Account: "+name)
                    if(error.response.hasOwnProperty("data")){
                        const e = error.response.data
                        if(e.hasOwnProperty("errors")){
                            if (e.errors[0].code == 88){
                                console.log("Rate limit.")
                            }
                            else if (e.errors[0].code ==  136){
                                console.log("User "+name+" has blocked the authenticated account.")
                                _delete(name, false)
                            }
                            else if(e.errors[0].code ==  32){
                                console.log("Could not authenticate.")
                            }
                            else if(e.errors[0].code ==  34 || e.errors[0].message.includes("User has been suspended.")){
                                console.error(e.errors[0])
                                _delete(name, true)
                            }
                            else if(e.errors[0].code ==  131 || e.errors[0].code ==  130){
                                console.error(e.errors[0])
                            }
                            else{
                                console.error(e)
                            }
                        }
                        else if(e.hasOwnProperty("error")){
                            if(e.error.includes('Not authorized')){
                                console.error(e.error)
                                _delete(name, true)
                            }
                            else{
                                console.error(error.response.status+": "+error.response.statusText)
                                console.error(e)
                            }
                        }
                        else{
                            if(e != "" && e != undefined){
                                console.error(error.response.status+": "+error.response.statusText)
                                console.error(e)
                            }
                            else{
                                console.error(error.response.status+": "+error.response.statusText)
                            }
                        }
                    }
                    else{
                        console.error(error.response.status+": "+error.response.statusText)
                    }
                }
                else{
                    const _e = error.toString()
                    if (!(errors.some(e => _e.includes(e)))){
                        console.log(name)
                        console.error(error)
                        console.log("Resuming")
                    }
                }
            }
            else {
                const _e = error.toString()
                if (!(errors.some(e => _e.includes(e)))){
                    console.error(error)
                    console.log("Resuming")
                }
            }
        })
    }
    catch(e){
        console.error(e)
        console.log("Resuming")
    }
}

function _delete(name, blocked){
    intervals.get(name).clear()
    T.get("users/show", { screen_name: name })
    .catch(e => {
        if ('errors' in e) {
            const msg = e.errors[0].message
            if(msg.includes("User not found") || msg.includes("User has been suspended.") || blocked == true){
                global_webhook.send(":grey_exclamation: | Couldn't find the account with handle : `"+name+"`, it's no longer monitored, maybe its screen name changed or it was deleted.")
                //
                delete monitors[name];
                const a = _.findIndex(config.accounts, function(account) { return account.name == name})
                config.accounts.splice(a, 1)
                fs.writeFile('./config/config.json', JSON.stringify(config, null, 4), "utf-8", ((err) => {if(err){console.error(err)}}))
            }
            else{
                console.log("Global delete function error: "+e.errors[0].message)
            }
        }
        else {
            console.log("Global delete function error: "+e)
        }
    })
}

process.on('uncaughtException', async err => {
    console.error(err+"\n"+err.stack)
    await fs.writeFileSync('./config/config.json', JSON.stringify(config, null, 4), "utf-8")
    process.exit(0)
});

process.on('unhandledRejection', async err => {
    console.error(err+"\n"+err.stack)
    await fs.writeFileSync('./config/config.json', JSON.stringify(config, null, 4), "utf-8")
    process.exit(0)
});

client.on('error', console.error)
client.on('ready', () => {
    client.user.setActivity('Type '+config.prefix+'help')
    console.log('Ready!')
    init()
});

client.login(config.token)