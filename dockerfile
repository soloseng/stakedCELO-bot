FROM node:12.22.11
WORKDIR /usr/app
COPY package.json ./
RUN yarn install
COPY . .
CMD [ "yarn", "start" ]