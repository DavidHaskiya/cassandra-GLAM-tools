//INCLUDES
var fs = require('fs');
var utf8 = require('utf8');
var MariaClient = require('mariasql');
var config = require('./config.js');
//CONSTANTS
const CONST_CAT_PER_QUERY = 40;
const CONST_IMG_PER_QUERY = 30;
const CONST_USE_PER_QUERY = 10;
//GLOBALS
var configDataObj;
var dbAccess;
var Categories;
var wikiCaller;
var images;
var catQueue;
var catHead=0;
var imgIndex;
var catFreeTail=0;
var usages;
var usagindex=0;
//FUNCTIONS
var Finalize=function()
{
    wikiCaller.end();
    config.storage.query("select * from doMaintenance();",function(err,res){
        config.storage.end();
        console.log("\nProcess fully completed!");
        return;
    });    
    return 0;
}
var SearchCatQueue=function(page)
{
    var i=0;
    while(i<catHead)
    {
        if(catQueue[i].page_title==page)
            break;
        i++;
    }
    if(i==catHead)
        i=-1;
    return i;
}
var WikiOpen = function () 
{
    catQueue=[];
    catFreeTail=1;
    catHead=0;
    catQueue[0] = new Object();
    catQueue[0].page_title=config.STARTING_CAT;
    catQueue[0].level=0;
    catQueue[0].cat_subcats=0;
    catQueue[0].cat_files=0;
    catQueue[0].father="ROOT";
    console.log("===========================================");
    console.log("Loading categories...");   
    wikiCaller = config.connectionToWMF;
    let temp_query="select cat_subcats, cat_files from category where cat_title='"+config.STARTING_CAT+"'";
    wikiCaller.query(temp_query, function (err, rows) 
    {
        catQueue[0].cat_subcats=rows[0].cat_subcats;
        catQueue[0].cat_files=rows[0].cat_files;
        GetLevelChilds();
    });
}
var GetLevelChilds = function () 
{
    if (catHead>=catFreeTail)//all visited
    {
        afterCategories();
        return;
    }
    console.log("At " + catHead + " of " + catFreeTail);
    var RQ="";
    var originalHead=catHead;
    while(catHead<catFreeTail&&catHead<(originalHead+CONST_CAT_PER_QUERY))
    {
        if(catHead>originalHead)
            RQ+=",";
        RQ+="'"+catQueue[catHead].page_title.replace(/'/g,"''")+"'"
        catHead++;
    }

    var query = BuildCategoryQuery(RQ);
    wikiCaller.query(query, function (err, rows) 
    {
        if (err)
            throw err;
        for (var k = 0; k < rows.length; k++) 
        {
            var newPage=utf8.decode(rows[k].page_title);
            var father=utf8.decode(rows[k].cl_to);
            if(SearchCatQueue(newPage)==-1)//prevent loops
            {
                var fatherIndex=SearchCatQueue(father);
                catQueue[catFreeTail] = new Object();
                catQueue[catFreeTail].page_title=newPage;
                catQueue[catFreeTail].cat_subcats=rows[k].cat_subcats;
                catQueue[catFreeTail].cat_files=rows[k].cat_files;
                catQueue[catFreeTail].level=catQueue[fatherIndex].level+1;
                catQueue[catFreeTail].father=father;
                
                catFreeTail++;
            }
        }
        GetLevelChilds();
    });
}
var afterCategories=function()
{
    //console.log(catQueue);
    //Load in postgres the data
    let storage_query="delete from categories; ";
    let i=0;
    while(i<catFreeTail)
    {
        let temp="";
        let Cat=catQueue[i];
        temp+="select * from addCategory('"+Cat.page_title.replace(/'/g,"''")+"',"+Cat.cat_subcats+","+Cat.cat_files+",'"+
            Cat.father.replace(/'/g,"''")+"',"+Cat.level+");\r\n";
        storage_query+=temp;
        i++;
    }
    
    //console.log(storage_query);
    config.storage.query(storage_query,function(err,res){
        console.log("Completed!");
        console.log("===========================================");
        console.log("Now loading images...");   
        catHead=0;
        imgIndex=0;
        images=[];
        LoadImages();
    });   
}
var LoadImages=function()
{
    if(catHead>=catFreeTail)
    {
        //console.log(images);
        afterImages();
        return;
    }  
    console.log("At " + catHead + " of " + catFreeTail);
    var RQ="";
    var originalHead=catHead;
    while(catHead<catFreeTail&&catHead<(originalHead+CONST_IMG_PER_QUERY))
    {
        if(catHead>originalHead)
            RQ+=",";
        RQ+="'"+catQueue[catHead].page_title.replace(/'/g,"''")+"'"
        catHead++;
    }

    var query = BuildImageQuery(RQ);
    wikiCaller.query(query, function (err, rows) 
    {
        if (err)
            throw err;
        for (var k = 0; k < rows.length; k++) 
        {
            images[imgIndex]=new Object();
            images[imgIndex].img_name=utf8.decode(rows[k].img_name);
            images[imgIndex].img_user_text=utf8.decode(rows[k].img_user_text);
            images[imgIndex].img_timestamp=ConvertTimestamp(rows[k].img_timestamp);
            images[imgIndex].img_size=rows[k].img_size;
            images[imgIndex].cl_to=utf8.decode(rows[k].cl_to);
            imgIndex++;
        }
        LoadImages();
    });

}
var ConvertTimestamp=function(TS)
{
    let retval=TS.substring(0,4)+"-"+TS.substring(4,6)+"-"+TS.substring(6,8)+" "+TS.substring(8,10)+":"+TS.substring(10,12)+":"+TS.substring(12,14);
    return retval;
}
var afterImages=function()
{
    let storage_query="update images set is_alive=false;";
    let i=0;
    while(i<imgIndex)
    {
        let temp="";
        let img=images[i];
        temp+="select * from addImage('"+img.img_name.replace(/'/g,"''")+"','"
            +img.img_user_text.replace(/'/g,"''")+"','"+img.img_timestamp+"',"+img.img_size+",'"+img.cl_to.replace(/'/g,"''")+"');\r\n";
        storage_query+=temp;
        i++;
    }
    
    config.storage.query(storage_query,function(err,res){
        console.log("Completed!");
        console.log("===========================================");
        console.log("Loading usages...");
        usages=[];
        usagindex=0;
        catHead=0;
        LoadUsages();
    });   
}
var LoadUsages=function()
{
    if(catHead>=catFreeTail)
    {
        afterUsages();
        return;
    }  
    console.log("At " + catHead + " of " + catFreeTail);
    var RQ="";
    var originalHead=catHead;
    while(catHead<catFreeTail&&catHead<(originalHead+CONST_USE_PER_QUERY))
    {
        if(catHead>originalHead)
            RQ+=",";
        RQ+="'"+catQueue[catHead].page_title.replace(/'/g,"''")+"'"
        catHead++;
    }

    var query = BuildUsageQuery(RQ);
    wikiCaller.query(query, function (err, rows) 
    {
        if (err)
            throw err;
        for (var k = 0; k < rows.length; k++) 
        {
            usages[usagindex]=new Object();
            usages[usagindex].gil_wiki=rows[k].gil_wiki;
            usages[usagindex].gil_page_title=utf8.decode(rows[k].gil_page_title);
            usages[usagindex].gil_to=utf8.decode(rows[k].gil_to);
            usagindex++;
        }
        LoadUsages();
    });

}
var afterUsages=function()
{
    let i=0;
    storage_query="";
    while(i<usagindex)
    {
        let temp="";
        let use=usages[i];
        temp+="select * from addUsage('"+use.gil_wiki+"','"+use.gil_page_title.replace(/'/g,"''")+"','"+use.gil_to.replace(/'/g,"''")+"');\r\n"
        storage_query+=temp;
        i++;
    }
    //console.log(storage_query);
    config.storage.query(storage_query,function(err,res){
        console.log("Completed!");
        Finalize();
    });   
    
}
var BuildUsageQuery=function(RQ)
{
    return `SELECT gil_wiki, gil_page_title, gil_to 
    FROM globalimagelinks, categorylinks, page, image 
    WHERE cl_to IN (${RQ}) 
    AND gil_to = img_name 
    AND gil_page_namespace_id = '0' 
    AND page_id = cl_from 
    AND page_namespace = 6 
    AND img_name = page_title`;
}
var BuildImageQuery=function(RQ)
{
    return `SELECT img_name, img_user_text, img_timestamp, img_size, cl_to 
    FROM categorylinks, page, image 
    WHERE cl_to IN(${RQ}) 
    AND page_id = cl_from 
    AND page_namespace = 6 
    AND img_name = page_title`;
}
var BuildCategoryQuery = function (RQ) 
{
    return `SELECT page_title, cl_to, cat_subcats, cat_files
    FROM categorylinks, page, category
    WHERE cl_to IN (${RQ})
    AND page_id = cl_from
    AND page_namespace = 14
    AND page_title = cat_title`;
}


//ENTRY POINT
console.log("Application launched...");
config.storage.connect();
WikiOpen();