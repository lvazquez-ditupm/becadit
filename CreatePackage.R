install.packages("devtools")
library("devtools")
devtools::install_github("klutometis/roxygen")
library(roxygen2)

setwd("C:/Users/usuario/Repos/beca-dit") # Choose parent folder
create("findAllJointAnomalies") #Choose name of package
setwd("findAllJointAnomalies/R")
# save function to R directory created after that
setwd("..")
document()
setwd("..")
install("findAllJointAnomalies")
