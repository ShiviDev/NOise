const url = "https://drive.google.com/file/d/1X-oqYaY0cQOkOln10BNgvJBrXixE5t2c/view?usp=share_link";
const id = url.substring(url.indexOf('/d/') + 3, url.indexOf('/', url.indexOf('/d/') + 3))
console.log(id);