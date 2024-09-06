# greythr-attendance
### Steps to setup/installation
1. Make sure you have node
2. install the dependencies using `npm i`
3. copy "./env.sample" to "./.env" and fill in the values

### How to create a notification workflow on github
1. Go to create workflow on slack
2. select webhook event
3. create data variable with name `user_email` and type `slack user email` and `message` and type as `text`
4. click on continue and copy the link and add it to `SLACK_NOTIFICATION_URI` in `.env`
5. add step and select messages > send message to a person
6. in the pop-up click select member dropdown select 'user_email' and similarly for message click insert a variable and click on message from the list 
7. click save
8. Horray! now you will get a message on slack when the script runs
