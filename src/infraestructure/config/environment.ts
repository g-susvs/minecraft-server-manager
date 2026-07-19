import dotenv from 'dotenv' ; 

dotenv.config ( ) ;

interface IEnvironment { 
  port : number ; 
}  

export const environment : IEnvironment = { 
  port : Number( process.env.PORT ) || 3000 , 
}
