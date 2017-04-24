setwd("/home/saturno/NetBeansProjects/becadit")

is.installed <- function(mypkg){
  is.element(mypkg, installed.packages()[,1])
} 

if (!is.installed("devtools")){
  install.packages("devtools", repos="http://cran.rstudio.com/")
}
if (!is.installed("jsonlite")){
  install.packages("jsonlite", repos="http://cran.rstudio.com/")
}
if (!is.installed("Hmisc")){
  install.packages("Hmisc", repos="http://cran.rstudio.com/")
}
if (!is.installed("dbscan")){
  install.packages("dbscan", repos="http://cran.rstudio.com/")
}
if (!is.installed("arules")){
  install.packages("arules", repos="http://cran.rstudio.com/")
}
if (!is.installed("arulesSequences")){
  install.packages("arulesSequences", repos="http://cran.rstudio.com/")
}
if (!is.installed("vcd")){
  install.packages("vcd", repos="http://cran.rstudio.com/")
}
if (!is.installed("ggplot2")){
  install.packages("ggplot2", repos="http://cran.rstudio.com/")
}
if (!is.installed("protolite")){
  install.packages("protolite", repos="http://cran.rstudio.com/")
}
if (!is.installed("opencpu")){
  install.packages("opencpu", repos="http://cran.rstudio.com/")
}

library(devtools)
library(jsonlite)
library(Hmisc)
library(dbscan)
library(arules)
library(arulesSequences)
library(vcd)
library(ggplot2)
library(opencpu)
opencpu$stop()
install("findAllJointAnomalies")
opencpu$start(5307)